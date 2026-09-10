import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { TestData, PracticeSet } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
];

/**
 * Executes a Gemini API call with automatic retry and backoff for rate limits (HTTP 429 / RESOURCE_EXHAUSTED).
 */
async function callGeminiWithRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      return await fn();
    } catch (error: any) {
      const errMsg = error?.message || String(error);
      const isQuotaOrRateLimit = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota') || errMsg.includes('rate-limits');
      
      if (isQuotaOrRateLimit) {
        if (attempt < maxRetries) {
          attempt++;
          let delayMs = 3000 * attempt;
          const retryDelayMatch = errMsg.match(/retry in ([0-9\.]+)s/i);
          if (retryDelayMatch && retryDelayMatch[1]) {
            const seconds = Math.min(parseFloat(retryDelayMatch[1]), 10);
            delayMs = Math.max(seconds * 1000, 2500);
          }
          console.warn(`[Gemini API] Chạm ngưỡng rate limit (429). Tự động thử lại sau ${Math.round(delayMs / 1000)}s (lần ${attempt}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
        
        throw new Error('Hạn ngạch AI (Quota 429) hiện tại đã hết hoặc mô hình Pro yêu cầu cấu hình dự án trả phí (Paid Project). Vui lòng cấu hình Paid Project trong Google AI Studio hoặc thử lại sau ít phút.');
      }
      
      throw error;
    }
  }
  throw new Error('Đã vượt quá số lần thử lại kết nối AI.');
}

/**
 * Intelligent and resilient JSON parser for Gemini responses.
 * Recovers valid questions even if response strings were truncated or contained unterminated tokens.
 */
function safeParseGeminiJson(raw: string): any {
  if (!raw || typeof raw !== 'string') {
    throw new Error('AI không trả về kết quả hoặc phản hồi trống.');
  }

  let text = raw.trim();
  // Strip markdown code fences if response was wrapped in ```json ... ```
  if (text.startsWith('```json')) {
    text = text.slice(7);
  } else if (text.startsWith('```')) {
    text = text.slice(3);
  }
  if (text.endsWith('```')) {
    text = text.slice(0, -3);
  }
  text = text.trim();

  // 1. Direct parse attempt
  try {
    const res = JSON.parse(text);
    if (res && Array.isArray(res.questions)) return res;
    if (Array.isArray(res)) return { title: "Đề thi", questions: res };
    if (res && typeof res === 'object') return res;
  } catch (e1) {
    console.warn('Direct JSON parse failed, attempting intelligent backward recovery...', e1);
  }

  // 2. Backward repair for truncated questions array:
  // If the model reached maximum output token limit mid-string or mid-object,
  // scan backwards for the last fully closed question object '}'
  let pos = text.length;
  while (true) {
    const lastCurly = text.lastIndexOf('}', pos - 1);
    if (lastCurly <= 0) break;
    pos = lastCurly;

    // Try closing the questions array and the root object
    const candidate = text.slice(0, lastCurly + 1) + '\n]}';
    try {
      const res = JSON.parse(candidate);
      if (res && Array.isArray(res.questions) && res.questions.length > 0) {
        console.log(`Successfully salvaged ${res.questions.length} questions from truncated output.`);
        return res;
      }
    } catch (ignore) {}

    // Try if the root response itself was an array of questions
    const candidateArray = text.slice(0, lastCurly + 1) + '\n]';
    try {
      const res = JSON.parse(candidateArray);
      if (Array.isArray(res) && res.length > 0) {
        return { title: 'Đề thi', questions: res };
      }
    } catch (ignore) {}
  }

  // 3. Fallback: try closing unterminated quotes and braces
  const closures = ['"}]}', '}]}', '"}', '}'];
  for (const c of closures) {
    try {
      const res = JSON.parse(text + c);
      if (res && Array.isArray(res.questions)) return res;
      if (Array.isArray(res)) return { title: 'Đề thi', questions: res };
    } catch (ignore) {}
  }

  throw new Error('Không thể phân tích dữ liệu bài thi từ AI do phản hồi bị ngắt quãng. Vui lòng thử lại với file có dung lượng gọn hơn.');
}

export const parseTestFiles = async (
  files: {data: string, mimeType: string, isBase64: boolean}[],
  options?: { excludeAudio?: boolean }
): Promise<TestData> => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('Thiếu GEMINI_API_KEY. Vui lòng kiểm tra cấu hình ứng dụng.');
  }

  console.log(`Parsing ${files.length} test files... excludeAudio=${options?.excludeAudio}`);
  
  const isExcludeAudio = options?.excludeAudio ?? false;

  const prompt = "Bạn là một AI chuyên gia khảo thí và tạo đề thi giáo dục tương tác. Nhiệm vụ của bạn là phân tích TOÀN BỘ tài liệu được tải lên và trích xuất thành bài thi tương tác CHUẨN ĐỀ THI TRÊN GIẤY.\n\n" +
                 "=================================================================================\n" +
                 "YÊU CẦU TỐI THƯỢNG: GIỮ NGUYÊN 100% ĐỊNH DẠNG CỦA ĐỀ THI TRÊN GIẤY GỐC\n" +
                 "TUYỆT ĐỐI KHÔNG ĐƯỢC TỰ Ý CHUYỂN ĐỔI BÀI TỰ LUẬN/ĐIỀN TỪ/VIẾT LẠI CÂU THÀNH TRẮC NGHIỆM A, B, C, D!\n" +
                 "Học sinh phải được làm bài thi với các ô nhập liệu y hệt như đang làm trên trang giấy thi thật.\n" +
                 "=================================================================================\n\n" +
                 "HÃY PHÂN LOẠI CHÍNH XÁC TỪNG CÂU HỎI THEO 5 DẠNG BÀI SAU:\n\n" +
                 "1. DẠNG BIẾN ĐỔI DẠNG TỪ / LOẠI TỪ ('word_form'):\n" +
                 "- Nhận diện: Các câu hỏi có từ gốc viết hoa trong ngoặc đơn ở cuối câu (ví dụ: '(BEAUTY)', '(SUCCESS)', '(POLLUTE)') hoặc thuộc phần bài 'Give the correct form of the words', 'Word Formation', 'Chia dạng đúng của từ'.\n" +
                 "- BẮT BUỘC 'type': 'word_form'\n" +
                 "- 'text': Toàn bộ câu có chỗ trống (ví dụ: 'The film was extremely ________. (INTEREST)')\n" +
                 "- 'promptWord': Từ gốc trong ngoặc viết hoa (ví dụ: 'INTEREST')\n" +
                 "- 'options': [] (BẮT BUỘC ĐỂ MẢNG RỖNG, TUYỆT ĐỐI KHÔNG TỰ BỊA 4 ĐÁP ÁN A, B, C, D; học sinh sẽ tự gõ từ vào ô trống như trên giấy)\n" +
                 "- 'correctTextAnswers': Mảng chứa các dạng từ đúng theo ngữ cảnh và đáp án (ví dụ: ['interesting'])\n" +
                 "- 'correctAnswer': 0\n\n" +
                 "2. DẠNG VIẾT LẠI CÂU / CHUYỂN ĐỔI CÂU / WRITING ('sentence_rewrite'):\n" +
                 "- Nhận diện: Các câu hỏi thuộc phần 'Rewrite the following sentences...', 'Sentence transformation', 'Complete the second sentence so that it has the same meaning', hoặc có câu gốc kèm từ/cụm từ gợi ý mở đầu (ví dụ: 'The last time...', 'She hasn\\'t...', 'If I were you...').\n" +
                 "- BẮT BUỘC 'type': 'sentence_rewrite'\n" +
                 "- 'text': Câu gốc ban đầu cần viết lại (ví dụ: 'I haven\\'t seen her for three years.')\n" +
                 "- 'givenPrefix': Cụm từ gợi ý bắt đầu câu viết lại được in trên đề giấy (ví dụ: 'The last time...'). Nếu có từ khóa trong ngoặc bắt buộc dùng, ghi rõ.\n" +
                 "- 'options': [] (BẮT BUỘC ĐỂ MẢNG RỖNG, TUYỆT ĐỐI KHÔNG TẠO PHƯƠNG ÁN TRẮC NGHIỆM; học sinh sẽ tự viết câu hoàn chỉnh)\n" +
                 "- 'correctTextAnswers': Mảng TẤT CẢ các cách viết lại câu đúng ngữ pháp theo đáp án (ví dụ: ['The last time I saw her was three years ago.', 'The last time I saw her was 3 years ago.'])\n" +
                 "- 'correctAnswer': 0\n\n" +
                 "3. DẠNG ĐIỀN TỪ VÀO CHỖ TRỐNG ('fill_blank'):\n" +
                 "- Nhận diện: Các câu hoặc đoạn văn có vị trí trống '______' hoặc '(1)... (2)...' mà ĐỀ BÀI GỐC TRÊN GIẤY KHÔNG CÓ 4 PHƯƠNG ÁN A, B, C, D (hoặc chỉ có một khung từ vựng Word Bank chung cho cả bài).\n" +
                 "- BẮT BUỘC 'type': 'fill_blank'\n" +
                 "- 'text': Câu văn hoặc đoạn văn có chỗ trống rõ ràng.\n" +
                 "- 'options': Danh sách các từ trong khung gợi ý (Word Bank) nếu đề giấy có cung cấp; nếu là bài điền từ tự do (Open Cloze) không cho trước thì 'options' PHẢI LÀ [].\n" +
                 "- 'correctTextAnswers': Mảng chứa các từ/cụm từ đúng cần điền vào chỗ trống theo đáp án.\n" +
                 "- 'correctAnswer': 0\n\n" +
                 "4. DẠNG TRẢ LỜI NGẮN / TỰ LUẬN ('short_answer'):\n" +
                 "- Nhận diện: Câu hỏi đọc hiểu trả lời ngắn, câu hỏi tính toán điền đáp số.\n" +
                 "- BẮT BUỘC 'type': 'short_answer'\n" +
                 "- 'options': []\n" +
                 "- 'correctTextAnswers': Mảng câu trả lời đúng được chấp nhận.\n" +
                 "- 'correctAnswer': 0\n\n" +
                 "5. DẠNG TRẮC NGHIỆM KHÁCH QUAN ('multiple_choice'):\n" +
                 "- CHỈ ĐƯỢC ÁP DỤNG KHI VÀ CHỈ KHI TRÊN ĐỀ THI GỐC CÓ IN RÕ CÁC PHƯƠNG ÁN LỰA CHỌN A, B, C, D.\n" +
                 "- 'type': 'multiple_choice'\n" +
                 "- 'options': Mảng chứa chính xác các phương án trên đề thi gốc.\n" +
                 "- 'correctAnswer': Chỉ số phương án đúng (0 cho A, 1 cho B, 2 cho C, 3 cho D).\n\n" +
                 (isExcludeAudio ? 
                 "CHẾ ĐỘ ĐỀ THI TRÊN GIẤY (LOẠI BỎ TOÀN BỘ PHẦN NGHE / AUDIO):\n" +
                 "- Người dùng đã chọn chế độ làm bài trên giấy, KHÔNG CÓ ÂM THANH.\n" +
                 "- BỎ QUA HOÀN TOÀN tất cả các bài tập nghe (Listening), không trích xuất các câu hỏi nghe audio.\n" +
                 "- Trích xuất trọn vẹn tất cả các phần bài làm trên giấy: Ngữ âm (Phát âm/Trọng âm), Ngữ pháp & Từ vựng, Điền từ vào chỗ trống, Dạng của từ (Word Form), Đọc hiểu, Viết lại câu (Writing/Transformation), Tự luận.\n\n" :
                 "PHẦN NGHE (NẾU CÓ):\n" +
                 "- Nếu đề có bài nghe mà không có file âm thanh kèm theo, hãy đưa kịch bản bài nghe (transcript) vào trường 'context' để học sinh đọc và trả lời như bài đọc hiểu trên giấy.\n\n") +
                 "LƯU Ý ĐẶC BIỆT VỀ HÌNH ẢNH VÀ DỮ LIỆU:\n" +
                 "TUYỆT ĐỐI KHÔNG BAO GIỜ sao chép chuỗi data:image, base64 hoặc chuỗi nhị phân dài vào các trường JSON (context, text, explanation). Nếu tài liệu có hình ảnh, chỉ ghi ngắn gọn: '[Hình ảnh minh họa]' hoặc mô tả nội dung hình ảnh bằng lời văn.\n\n" +
                 "ĐẶC ĐIỂM QUAN TRỌNG CHO ĐỀ TIẾNG ANH:\n" +
                 "1. Trong các bài tập PHÁT ÂM (Pronunciation) hoặc TRỌNG ÂM (Stress): Giữ nguyên phần gạch chân bằng thẻ HTML <u>...</u> (ví dụ: 'bl<u>a</u>ck', '<u>st</u>art'). TUYỆT ĐỐI KHÔNG BỎ GẠCH CHÂN.\n\n" +
                 "ĐẶC ĐIỂM CHO CÁC MÔN TỰ NHIÊN (Toán, Lý, Hóa):\n" +
                 "Tất cả công thức toán học và ký hiệu phải được viết bằng cú pháp LaTeX ($...$ hoặc $$...$$).\n\n" +
                 "ĐIỂM SỐ (BAREME ĐIỂM):\n" +
                 "Trích xuất số điểm từng câu từ đề thi. Nếu không ghi rõ, hãy phân bổ đều sao cho tổng điểm toàn bài là 10.0 điểm.\n" +
                 "- 'points': Điểm cho câu đúng.\n" +
                 "- 'penaltyPoints': 0 (nếu không có quy định trừ điểm).\n\n" +
                 "ĐỐI CHIẾU ĐÁP ÁN VÀ TẠI LỜI GIẢI:\n" +
                 "Dựa vào file đáp án đi kèm (nếu có) để đối chiếu và xác định chuẩn xác 'correctAnswer' và 'correctTextAnswers'. Giải thích rõ ràng nguyên lý ngữ pháp, từ vựng hoặc công thức trong 'explanation'.";

  const parts: any[] = [{ text: prompt }];

  for (const file of files) {
    if (file.isBase64 && (file.mimeType === "application/pdf" || file.mimeType.startsWith("image/"))) {
      parts.push({
        inlineData: {
          data: file.data,
          mimeType: file.mimeType,
        },
      });
    } else {
      const sanitizedText = file.data 
        ? file.data.replace(/src="data:image\/[^;]+;base64,[^"]+"/g, 'src="[Hình ảnh]"').replace(/data:image\/[^"'\s>]{50,}/g, '[Hình ảnh minh họa]')
        : '';
      parts.push({
        text: `Nội dung tài liệu:\n\n${sanitizedText}`,
      });
    }
  }

  try {
    const response = await callGeminiWithRetry(() => ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: [{ parts }],
      config: {
        safetySettings,
        systemInstruction: "Bạn là một AI quản trò cho ứng dụng 'Nhà Thám Hiểm Địa Lý Nhí'. Nhiệm vụ của bạn là đưa ra các gợi ý thông minh, thú vị để trẻ em nhận diện được quốc gia/địa danh. Tuyệt đối KHÔNG đưa ra những gợi ý chung chung vô nghĩa (ví dụ: nằm trên Trái Đất). Mỗi câu hỏi phải cung cấp các gợi ý cụ thể về: đặc điểm địa lý nổi bật, quốc hoa, biểu tượng, danh nhân, món ăn truyền thống, trang phục hoặc kỳ quan nổi tiếng của quốc gia đó. Đồng thời, bạn là chuyên gia khảo thí và tạo đề thi giáo dục tương tác chuẩn đề thi trên giấy. Giữ nguyên 100% định dạng đề thi giấy gốc cho học sinh làm bài: điền từ vào chỗ trống (fill_blank), dạng của từ (word_form), viết lại câu (sentence_rewrite), trả lời ngắn (short_answer), và chỉ dùng trắc nghiệm (multiple_choice) khi đề gốc có sẵn 4 lựa chọn A, B, C, D.",
        responseMimeType: "application/json",
        maxOutputTokens: 65536,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { 
                    type: Type.STRING, 
                    enum: ["multiple_choice", "fill_blank", "word_form", "sentence_rewrite", "short_answer"],
                    description: "Question format: 'multiple_choice', 'fill_blank', 'word_form', 'sentence_rewrite', 'short_answer'" 
                  },
                  context: { type: Type.STRING, description: "Reading passage, instructions, or transcript" },
                  text: { type: Type.STRING, description: "Question prompt, sentence with blank, or original sentence to rewrite" },
                  options: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Options for multiple choice (A, B, C, D) or word bank"
                  },
                  correctAnswer: { type: Type.INTEGER, description: "Index 0-3 for multiple choice (0 for text-based questions)" },
                  correctTextAnswers: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Acceptable text answers for fill_blank, word_form, sentence_rewrite, short_answer"
                  },
                  promptWord: { type: Type.STRING, description: "Root word in brackets for word_form, e.g. 'HAPPY'" },
                  givenPrefix: { type: Type.STRING, description: "Starting phrase for sentence_rewrite, e.g. 'The last time...'" },
                  explanation: { type: Type.STRING },
                  topic: { type: Type.STRING },
                  points: { type: Type.NUMBER, description: "Points for correct answer, e.g. 0.25" },
                  penaltyPoints: { type: Type.NUMBER, description: "Points deducted for incorrect answer, e.g. 0" },
                },
                required: ["type", "text", "explanation", "topic", "points", "penaltyPoints"],
              },
            },
          },
          required: ["title", "questions"],
        },
      },
    }));

    let text = response.text;
    if (!text && response.candidates && response.candidates.length > 0) {
      const candidate = response.candidates[0];
      if (candidate.content?.parts) {
        text = candidate.content.parts.map((p: any) => p.text || '').filter(Boolean).join('');
      }
    }

    if (!text) {
      const candidate = response.candidates?.[0];
      const finishReason = candidate?.finishReason;
      const blockReason = (response as any).promptFeedback?.blockReason;
      if (finishReason === 'SAFETY' || blockReason === 'SAFETY') {
        throw new Error('Tài liệu bị bộ lọc an toàn của AI từ chối phân tích. Vui lòng kiểm tra lại nội dung file.');
      } else if (finishReason === 'RECITATION') {
        throw new Error('Nội dung tài liệu bị chặn do trùng khớp với văn bản có bản quyền.');
      } else if (finishReason === 'MAX_TOKENS') {
        throw new Error('Tài liệu quá dài vượt quá giới hạn xử lý của AI. Vui lòng chia nhỏ đề thi thành các phần ngắn hơn.');
      }
      throw new Error('AI không trả về kết quả nội dung hoặc phản hồi trống. Vui lòng thử lại với tài liệu rõ nét hơn.');
    }

    const parsed = safeParseGeminiJson(text);
    if (!parsed.questions || !Array.isArray(parsed.questions)) {
      throw new Error('Định dạng dữ liệu AI trả về không hợp lệ.');
    }

    // Generate a simple 4-digit code for the test
    const testCode = Math.floor(1000 + Math.random() * 9000).toString();

    const totalQuestions = parsed.questions.length;
    const defaultPointsPerQuestion = totalQuestions > 0 ? Math.round((10 / totalQuestions) * 100) / 100 : 1;

    return {
      ...parsed,
      id: crypto.randomUUID(),
      testCode,
      date: new Date().toISOString(),
      excludeAudio: isExcludeAudio,
      questions: parsed.questions.map((q: any, index: number) => {
        let detectedType: any = q.type || '';
        let validOptions: string[] = Array.isArray(q.options) ? q.options.map(String) : [];
        let validTextAnswers: string[] = Array.isArray(q.correctTextAnswers) 
          ? q.correctTextAnswers.map((s: any) => String(s).trim()).filter(Boolean)
          : (q.correctTextAnswer ? [String(q.correctTextAnswer).trim()] : []);
        let promptWord: string | undefined = q.promptWord ? String(q.promptWord).trim().toUpperCase() : undefined;
        let givenPrefix: string | undefined = q.givenPrefix ? String(q.givenPrefix).trim() : undefined;

        const textStr = String(q.text || '');
        const contextStr = String(q.context || '');
        const topicStr = String(q.topic || '');
        const combinedMeta = `${textStr} ${contextStr} ${topicStr}`.toLowerCase();

        // 1. Detect Word Form / Dạng của từ
        const bracketWordMatch = textStr.match(/\(([A-Za-z\s/-]{2,25})\)\s*[\.\?]?\s*$/);
        const isWordFormContext = combinedMeta.includes('word form') || 
                                  combinedMeta.includes('dạng của từ') || 
                                  combinedMeta.includes('loại từ') || 
                                  combinedMeta.includes('form of the word');

        if (promptWord || bracketWordMatch || isWordFormContext) {
          detectedType = 'word_form';
          if (!promptWord && bracketWordMatch) {
            promptWord = bracketWordMatch[1].trim().toUpperCase();
          }
          // If Gemini generated artificial options for a word-form test, harvest correct answer and clear options
          if (validOptions.length > 0) {
            const correctOpt = validOptions[q.correctAnswer ?? 0];
            if (correctOpt && !validTextAnswers.includes(correctOpt)) {
              validTextAnswers.push(correctOpt);
            }
            validOptions = [];
          }
        }

        // 2. Detect Sentence Rewrite / Viết lại câu
        const isRewriteContext = combinedMeta.includes('rewrite') || 
                                 combinedMeta.includes('viết lại câu') || 
                                 combinedMeta.includes('chuyển đổi câu') || 
                                 combinedMeta.includes('sentence transformation') ||
                                 combinedMeta.includes('same meaning') ||
                                 textStr.startsWith('->') ||
                                 textStr.startsWith('Rewrite:');

        if (detectedType === 'sentence_rewrite' || givenPrefix || isRewriteContext) {
          detectedType = 'sentence_rewrite';
          // Extract prefix if embedded in text like "-> She hasn't..." or "Rewrite: If I were..."
          if (!givenPrefix) {
            const prefixMatch = textStr.match(/(?:->|Rewrite:|Bắt đầu bằng:)\s*([A-Za-z\s'’]+?)(?:\.{2,}|…|$)/i);
            if (prefixMatch && prefixMatch[1].trim().length < 40) {
              givenPrefix = prefixMatch[1].trim();
            }
          }
          if (validOptions.length > 0) {
            const correctOpt = validOptions[q.correctAnswer ?? 0];
            if (correctOpt && !validTextAnswers.includes(correctOpt)) {
              validTextAnswers.push(correctOpt);
            }
            validOptions = [];
          }
        }

        // 3. Detect Fill in the blank
        if (!detectedType) {
          if (textStr.includes('______') || textStr.includes('....') || textStr.includes('___')) {
            if (combinedMeta.includes('điền từ') || combinedMeta.includes('gap-fill') || combinedMeta.includes('cloze')) {
              detectedType = 'fill_blank';
            }
          }
        }

        // Fallback or explicit check
        if (!detectedType) {
          if (validOptions.length >= 2) {
            detectedType = 'multiple_choice';
          } else if (validTextAnswers.length > 0) {
            detectedType = 'fill_blank';
          } else {
            detectedType = 'multiple_choice';
          }
        }

        // For text-based question types, if options look like fake A/B/C/D created by AI, empty them
        if (['word_form', 'sentence_rewrite', 'short_answer'].includes(detectedType)) {
          validOptions = [];
        } else if (detectedType === 'fill_blank') {
          // Keep options ONLY if it looks like a genuine word bank (not ["A. ...", "B. ..."])
          const isFakeMCQ = validOptions.length === 4 && validOptions.every((opt, i) => {
            const prefix = String.fromCharCode(65 + i);
            return opt.startsWith(`${prefix}.`) || opt.startsWith(`${prefix})`);
          });
          if (isFakeMCQ) {
            const correctOpt = validOptions[q.correctAnswer ?? 0]?.replace(/^[A-D][\.\)]\s*/, '');
            if (correctOpt && !validTextAnswers.includes(correctOpt)) {
              validTextAnswers.push(correctOpt);
            }
            validOptions = [];
          }
        }

        return {
          ...q,
          id: `q-${index}`,
          type: detectedType,
          options: validOptions,
          correctAnswer: typeof q.correctAnswer === 'number' ? q.correctAnswer : 0,
          correctTextAnswers: validTextAnswers,
          promptWord: promptWord || undefined,
          givenPrefix: givenPrefix || undefined,
          points: typeof q.points === 'number' && !isNaN(q.points) 
            ? Math.round(q.points * 100) / 100 
            : defaultPointsPerQuestion,
          penaltyPoints: typeof q.penaltyPoints === 'number' && !isNaN(q.penaltyPoints) 
            ? Math.round(q.penaltyPoints * 100) / 100 
            : 0
        };
      })
    } as TestData;
  } catch (error) {
    console.error('Gemini API Error:', error);
    throw error;
  }
};

export const generatePracticeQuestions = async (failedTopics: string[]): Promise<PracticeSet[]> => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('Thiếu GEMINI_API_KEY.');
  }

  const response = await callGeminiWithRetry(() => ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `Dựa trên các chủ đề mà học sinh đã làm sai: ${failedTopics.join(", ")}, hãy tạo thêm 2 câu hỏi luyện tập cho mỗi chủ đề để giúp học sinh ôn tập. 
    Mỗi câu hỏi cần có nội dung, các lựa chọn, đáp án đúng và giải thích chi tiết. 
    LƯU Ý: Sử dụng LaTeX ($...$ hoặc $$...$$) cho tất cả các công thức toán học và ký hiệu khoa học.
    Trả về định dạng JSON mảng các PracticeSet.`,
    config: {
      safetySettings,
      systemInstruction: "Bạn là một AI quản trò cho ứng dụng 'Nhà Thám Hiểm Địa Lý Nhí'. Nhiệm vụ của bạn là đưa ra các gợi ý thông minh, thú vị để trẻ em nhận diện được quốc gia/địa danh. Tuyệt đối KHÔNG đưa ra những gợi ý chung chung vô nghĩa (ví dụ: nằm trên Trái Đất). Mỗi câu hỏi phải cung cấp các gợi ý cụ thể về: đặc điểm địa lý nổi bật, quốc hoa, biểu tượng, danh nhân, món ăn truyền thống, trang phục hoặc kỳ quan nổi tiếng của quốc gia đó. Đồng thời bạn là chuyên gia khảo thí và tạo bài tập luyện tập củng cố kiến thức cho học sinh.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            topic: { type: Type.STRING },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING },
                  options: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  correctAnswer: { type: Type.INTEGER },
                  explanation: { type: Type.STRING },
                },
                required: ["text", "options", "correctAnswer", "explanation"],
              },
            },
          },
          required: ["topic", "questions"],
        },
      },
    },
  }));

  try {
    const raw = response.text || "[]";
    const parsed = safeParseGeminiJson(raw);
    return (Array.isArray(parsed) ? parsed : (parsed.questions || [])) as PracticeSet[];
  } catch (err) {
    console.warn('Fallback practice set parse:', err);
    try {
      return JSON.parse(response.text || "[]") as PracticeSet[];
    } catch {
      return [];
    }
  }
};
