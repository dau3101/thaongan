import React, { useState, useEffect } from 'react';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { Question, UserAnswer, QuestionType } from '../types';
import { cn, checkTextAnswer } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface TestViewProps {
  questions: Question[];
  testCode?: string;
  onFinish: (answers: UserAnswer[], timeTaken: number) => void;
  onHome?: () => void;
  initialAnswers?: Record<string, UserAnswer>;
  initialIndex?: number;
  isReviewMode?: boolean;
  onBackToResult?: () => void;
  onAnswerChange?: (answers: Record<string, UserAnswer>) => void;
  onIndexChange?: (index: number) => void;
  onConfirm?: (
    title: string,
    message: string,
    onConfirm: () => void,
    onCancel?: () => void,
    confirmText?: string,
    cancelText?: string
  ) => void;
  startTime?: number;
  audioData?: string[];
}

const safeRehypePlugins = [[rehypeKatex, { throwOnError: false, strict: false }], rehypeRaw] as any;

export const TestView: React.FC<TestViewProps> = ({ 
  questions, 
  testCode, 
  onFinish, 
  onHome,
  initialAnswers = {}, 
  initialIndex = 0,
  isReviewMode = false,
  onBackToResult,
  onAnswerChange,
  onIndexChange,
  onConfirm,
  startTime,
  audioData
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [answers, setAnswers] = useState<Record<string, UserAnswer>>(initialAnswers);
  const [showExplanation, setShowExplanation] = useState(isReviewMode);
  const [searchTerm, setSearchTerm] = useState('');
  const [sessionStartTime] = useState(() => startTime || Date.now());
  const [isAudioHidden, setIsAudioHidden] = useState(false);
  const [isPaperMode, setIsPaperMode] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [isEditingAnswer, setIsEditingAnswer] = useState(false);

  // Keep state synchronized if props change (e.g. on resume/reload)
  useEffect(() => {
    if (initialAnswers && Object.keys(initialAnswers).length > 0) {
      setAnswers(prev => ({ ...prev, ...initialAnswers }));
    }
  }, [initialAnswers]);

  useEffect(() => {
    if (typeof initialIndex === 'number' && initialIndex !== currentIndex) {
      setCurrentIndex(initialIndex);
    }
  }, [initialIndex]);

  const currentQuestion = questions[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;
  const questionKey = currentQuestion.id || currentIndex.toString();
  const currentAnswer = answers[questionKey];
  const isAnswered = !!currentAnswer;

  // Detect Question Type
  const questionType: QuestionType = currentQuestion.type || (
    currentQuestion.promptWord ? 'word_form' :
    currentQuestion.givenPrefix ? 'sentence_rewrite' :
    (currentQuestion.options && currentQuestion.options.length >= 2) ? 'multiple_choice' :
    (currentQuestion.correctTextAnswers && currentQuestion.correctTextAnswers.length > 0) ? 'fill_blank' :
    'multiple_choice'
  );

  const isTextType = questionType !== 'multiple_choice';

  // Sync text input whenever question changes (never depend on answers to prevent wiping user's typing)
  useEffect(() => {
    const saved = answers[questionKey]?.textAnswer;
    const draft = sessionStorage.getItem(`draft_ans_${questionKey}`);
    setTextInput(saved || draft || '');
    setIsEditingAnswer(!saved);
  }, [currentIndex, questionKey]);

  // Auto commit text answers seamlessly so users never lose a word
  const autoCommitTextAnswer = (valueToCommit = textInput) => {
    if (isReviewMode || !isTextType) return;
    const trimmed = valueToCommit.trim();
    if (!trimmed) return;

    const isCorrect = checkTextAnswer(
      trimmed,
      currentQuestion.correctTextAnswers,
      currentQuestion.givenPrefix
    );

    const newAnswer: UserAnswer = {
      questionId: questionKey,
      textAnswer: trimmed,
      isCorrect,
    };

    const newAnswers = {
      ...answers,
      [newAnswer.questionId]: newAnswer
    };

    setAnswers(newAnswers);
    onAnswerChange?.(newAnswers);
    setIsEditingAnswer(false);
  };

  const handleFinish = () => {
    if (isTextType && textInput.trim()) {
      autoCommitTextAnswer();
    }

    if (isReviewMode) {
      onBackToResult?.();
      return;
    }

    const doFinish = () => {
      const timeTaken = Math.floor((Date.now() - sessionStartTime) / 1000);
      onFinish(Object.values(answers), timeTaken);
    };

    if (answeredCount < questions.length) {
      if (onConfirm) {
        onConfirm(
          'Nộp bài sớm?',
          `Bạn mới chỉ trả lời ${answeredCount}/${questions.length} câu hỏi. Bạn có chắc chắn muốn nộp bài ngay bây giờ không?`,
          doFinish,
          undefined,
          'Nộp bài ngay',
          'Làm tiếp'
        );
      } else if (confirm(`Bạn mới chỉ trả lời ${answeredCount}/${questions.length} câu hỏi. Bạn có chắc chắn muốn nộp bài ngay bây giờ không?`)) {
        doFinish();
      }
    } else {
      doFinish();
    }
  };

  const handleOptionSelect = (index: number) => {
    if ((isAnswered && !isEditingAnswer) || isReviewMode) return;

    const isCorrect = index === currentQuestion.correctAnswer;
    const newAnswer: UserAnswer = {
      questionId: questionKey,
      selectedOption: index,
      isCorrect,
    };
    
    const newAnswers = {
      ...answers,
      [newAnswer.questionId]: newAnswer
    };
    
    setAnswers(newAnswers);
    onAnswerChange?.(newAnswers);
    setShowExplanation(true);
    setIsEditingAnswer(false);
  };

  const handleTextAnswerSubmit = (valueToSubmit: string) => {
    if (isReviewMode) return;
    const trimmed = valueToSubmit.trim();
    if (!trimmed) return;

    const isCorrect = checkTextAnswer(
      trimmed,
      currentQuestion.correctTextAnswers,
      currentQuestion.givenPrefix
    );

    const newAnswer: UserAnswer = {
      questionId: questionKey,
      textAnswer: trimmed,
      isCorrect,
    };

    const newAnswers = {
      ...answers,
      [newAnswer.questionId]: newAnswer
    };

    setAnswers(newAnswers);
    onAnswerChange?.(newAnswers);
    setShowExplanation(true);
    setIsEditingAnswer(false);
  };

  const handleNext = () => {
    if (isTextType && textInput.trim()) {
      autoCommitTextAnswer();
    }
    if (isLastQuestion) {
      handleFinish();
    } else {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      onIndexChange?.(nextIndex);
      setShowExplanation(false);
      setSearchTerm('');
    }
  };

  const handlePrev = () => {
    if (isTextType && textInput.trim()) {
      autoCommitTextAnswer();
    }
    if (currentIndex > 0) {
      const prevIndex = currentIndex - 1;
      setCurrentIndex(prevIndex);
      onIndexChange?.(prevIndex);
      setShowExplanation(false);
      setSearchTerm('');
    }
  };

  const jumpToQuestion = (index: number) => {
    if (isTextType && textInput.trim()) {
      autoCommitTextAnswer();
    }
    setCurrentIndex(index);
    onIndexChange?.(index);
    setShowExplanation(false);
    setSearchTerm('');
  };

  const answeredCount = Object.keys(answers).length;
  const progress = (answeredCount / questions.length) * 100;

  const getTypeLabel = (type: QuestionType) => {
    switch (type) {
      case 'sentence_rewrite':
        return { tag: '✍️ Viết lại câu', desc: 'Chuyển đổi câu giữ nguyên nghĩa' };
      case 'word_form':
        return { tag: '🔤 Dạng của từ', desc: 'Biến đổi dạng từ trong ngoặc' };
      case 'fill_blank':
        return { tag: '✏️ Điền vào chỗ trống', desc: 'Điền từ / cụm từ thích hợp' };
      case 'short_answer':
        return { tag: '📝 Trả lời ngắn', desc: 'Viết câu trả lời tự luận' };
      case 'multiple_choice':
      default:
        return { tag: '🔘 Trắc nghiệm A-B-C-D', desc: 'Chọn 1 phương án đúng' };
    }
  };

  const typeInfo = getTypeLabel(questionType);

  const canProceed = isAnswered || (isTextType && textInput.trim().length > 0) || isLastQuestion || isReviewMode;

  return (
    <div className={cn(
      "w-full max-w-6xl mx-auto min-h-[80vh] flex flex-col md:flex-row gap-6 p-4 md:p-6 transition-colors",
      isPaperMode ? "bg-[#fcfbf9]" : "bg-slate-50/50"
    )}>
      {/* Sidebar Navigation */}
      <div className="w-full md:w-64 shrink-0 order-2 md:order-1">
        <div className={cn(
          "rounded-2xl p-5 sticky top-6 shadow-sm border",
          isPaperMode ? "bg-white border-amber-200" : "bg-white border-slate-200"
        )}>
          {onHome && (
            <button
              onClick={onHome}
              className="w-full flex items-center justify-center gap-2 mb-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 transition-all font-bold text-sm group"
              title="Lưu bài làm và quay lại thư viện"
            >
              <span>🏠</span> Tạm dừng & Về thư viện
            </button>
          )}

          {/* Paper Mode Toggle */}
          <button
            onClick={() => setIsPaperMode(!isPaperMode)}
            className={cn(
              "w-full flex items-center justify-center gap-2 mb-4 py-2 px-3 rounded-xl text-xs font-bold transition-all border",
              isPaperMode 
                ? "bg-amber-100/80 text-amber-900 border-amber-300 shadow-inner" 
                : "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200"
            )}
            title="Bật giao diện mô phỏng trang giấy thi"
          >
            <span>📄</span> {isPaperMode ? "Chế độ: Đề thi trên giấy" : "Bật giao diện đề giấy"}
          </button>

          <div className="flex items-center gap-2 mb-4 text-slate-800 font-bold text-sm">
            <span>📋</span>
            <span>Danh sách câu hỏi</span>
          </div>

          {testCode && (
            <div className="mb-4 p-3 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center gap-2">
              <span className="text-base">🔢</span>
              <div className="flex flex-col">
                <span className="text-[10px] text-indigo-400 font-black uppercase tracking-wider">Mã đề thi</span>
                <span className="text-sm font-black text-indigo-700">{testCode}</span>
              </div>
            </div>
          )}
          
          <div className="grid grid-cols-5 gap-2 mb-6 max-h-[300px] overflow-y-auto pr-1">
            {questions.map((_, idx) => {
              const qId = questions[idx].id || idx.toString();
              const answer = answers[qId];
              const answered = !!answer;
              const isCurrent = currentIndex === idx;
              const isCorrect = answer?.isCorrect;
              
              return (
                <button
                  key={idx}
                  onClick={() => jumpToQuestion(idx)}
                  className={cn(
                    "w-full aspect-square rounded-lg flex items-center justify-center text-xs font-bold transition-all border-2",
                    isCurrent ? "border-indigo-600 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-200" : 
                    answered ? (
                      isCorrect ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-red-400 bg-red-50 text-red-700"
                    ) : (
                      isPaperMode ? "border-amber-200 bg-amber-50/40 text-slate-600 hover:border-amber-400" : "border-slate-100 bg-slate-50 text-slate-600 hover:border-slate-300"
                    )
                  )}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs font-bold text-slate-500">
              <span>Đã hoàn thành:</span>
              <span>{answeredCount}/{questions.length}</span>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div 
                style={{ width: `${progress}%` }} 
                className="h-full bg-emerald-500 transition-all duration-300"
              />
            </div>
          </div>

          <button
            onClick={handleFinish}
            className={cn(
              "w-full mt-6 font-bold py-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 text-sm",
              answeredCount === questions.length 
                ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200" 
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800 border border-slate-200"
            )}
          >
            <span>{answeredCount === questions.length ? '📝 Nộp bài thi' : '📤 Nộp bài sớm'}</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 order-1 md:order-2 min-w-0">
        {onHome && (
          <button
            onClick={onHome}
            className="flex items-center gap-2 mb-4 px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 transition-all font-bold text-sm group shadow-sm md:hidden"
          >
            <span>🏠</span> Tạm dừng & Về thư viện
          </button>
        )}

        {/* Audio Section (if any audio files exist) */}
        {audioData && audioData.length > 0 && (
          <div className={cn(
            "mb-6 p-4 md:p-5 rounded-2xl border shadow-sm transition-all",
            isPaperMode ? "bg-white border-amber-200" : "bg-white border-slate-200"
          )}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
                <span className="text-xl">🎧</span>
                <span>Phần Nghe (Listening)</span>
              </h3>
              <button
                onClick={() => setIsAudioHidden(!isAudioHidden)}
                className="text-xs font-bold text-slate-600 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-all border border-slate-200"
              >
                {isAudioHidden ? "🔊 Hiện thanh phát âm thanh" : "🔇 Ẩn âm thanh (Làm bài giấy)"}
              </button>
            </div>

            {!isAudioHidden && (
              <div className="flex flex-col gap-3">
                {audioData.map((audio, index) => (
                  <div key={index} className="w-full bg-slate-50 p-2 rounded-xl border border-slate-200 flex items-center">
                    <audio controls src={audio} className="w-full h-10 outline-none" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <AnimatePresence initial={false}>
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="space-y-6"
          >
            {/* Question Header & Content */}
            <div className={cn(
              "rounded-2xl border p-6 md:p-8 shadow-sm transition-all",
              isPaperMode 
                ? "bg-white border-amber-300 shadow-md font-serif" 
                : "bg-white border-slate-200 font-sans"
            )}>
              {/* Question Metadata Row */}
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn(
                    "px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider",
                    isPaperMode ? "bg-amber-100 text-amber-900 border border-amber-200" : "bg-indigo-100 text-indigo-700"
                  )}>
                    Câu {currentIndex + 1}
                  </span>

                  <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-bold border border-slate-200 flex items-center gap-1">
                    <span>{typeInfo.tag}</span>
                  </span>

                  {typeof currentQuestion.points === 'number' && (
                    <span className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold rounded-full">
                      +{Math.round(currentQuestion.points * 100) / 100} điểm
                    </span>
                  )}

                  {typeof currentQuestion.penaltyPoints === 'number' && currentQuestion.penaltyPoints > 0 && (
                    <span className="px-2.5 py-1 bg-red-50 border border-red-200 text-red-600 text-[11px] font-bold rounded-full">
                      -{Math.round(currentQuestion.penaltyPoints * 100) / 100} đ nếu sai
                    </span>
                  )}

                  {currentQuestion.topic && (
                    <span className="text-xs text-slate-500 font-medium italic hidden sm:inline ml-2">
                      | {currentQuestion.topic}
                    </span>
                  )}
                </div>

                <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                  <span>💾</span> Tự động lưu
                </span>
              </div>

              {/* Context / Reading Passage (if any) */}
              {currentQuestion.context && (
                <div className="space-y-3 mb-6">
                  <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    <div className="flex items-center gap-2 text-slate-700 font-bold text-xs uppercase tracking-wider px-2">
                      <span>📄</span> Đoạn văn / Hướng dẫn đề thi
                    </div>
                    <div className="relative flex-1 max-w-[200px]">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs">🔍</span>
                      <input
                        type="text"
                        placeholder="Tìm kiếm..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg py-1 pl-7 pr-6 text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                      />
                      {searchTerm && (
                        <button 
                          onClick={() => setSearchTerm('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                  <div className={cn(
                    "p-5 rounded-xl text-sm leading-relaxed overflow-hidden border-l-4 border-indigo-500",
                    isPaperMode ? "bg-[#fffefc] border-slate-200 text-slate-800" : "bg-slate-50/70 text-slate-700"
                  )}>
                    <div className="markdown-body">
                      <Markdown remarkPlugins={[remarkMath]} rehypePlugins={safeRehypePlugins}>
                        {currentQuestion.context}
                      </Markdown>
                    </div>
                  </div>
                </div>
              )}

              {/* Question Text */}
              <div className="mb-6">
                <div className="text-lg md:text-xl font-bold text-slate-900 leading-relaxed markdown-body">
                  <Markdown remarkPlugins={[remarkMath]} rehypePlugins={safeRehypePlugins}>
                    {currentQuestion.text}
                  </Markdown>
                </div>
              </div>

              {/* DẠNG 1: SENTENCE REWRITE (VIẾT LẠI CÂU) */}
              {questionType === 'sentence_rewrite' && (
                <div className="space-y-4 my-6">
                  {currentQuestion.givenPrefix && (
                    <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-xl flex items-center gap-3">
                      <span className="font-extrabold text-indigo-700 text-sm whitespace-nowrap">✍️ Bắt đầu bằng:</span>
                      <span className="font-bold text-indigo-950 bg-white px-3 py-1 rounded-lg border border-indigo-200 shadow-xs">
                        {currentQuestion.givenPrefix} ...
                      </span>
                    </div>
                  )}

                  <div className="space-y-3">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                      Bài làm của bạn (viết câu hoàn chỉnh):
                    </label>
                    <textarea
                      rows={3}
                      value={textInput}
                      disabled={isAnswered && !isEditingAnswer && !isReviewMode}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTextInput(val);
                        try { sessionStorage.setItem(`draft_ans_${questionKey}`, val); } catch (err) {}
                      }}
                      onBlur={() => {
                        if (textInput.trim()) autoCommitTextAnswer(textInput);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleTextAnswerSubmit(textInput);
                        }
                      }}
                      placeholder="Gõ câu viết lại của bạn vào đây (nhấn Enter hoặc chuyển câu sẽ tự động lưu)..."
                      className={cn(
                        "w-full p-4 rounded-xl border-2 font-medium text-slate-800 text-base outline-none transition-all resize-none shadow-inner",
                        isAnswered && !isEditingAnswer ? "bg-slate-50 border-slate-200" : "bg-white border-slate-300 focus:border-indigo-600 focus:bg-white"
                      )}
                    />

                    {(!isAnswered || isEditingAnswer) && !isReviewMode && (
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleTextAnswerSubmit(textInput)}
                          disabled={!textInput.trim()}
                          className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-md disabled:opacity-50 text-sm"
                        >
                          ✍️ Ghi nhận câu trả lời
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* DẠNG 2: WORD FORM (BIẾN ĐỔI DẠNG TỪ) */}
              {questionType === 'word_form' && (
                <div className="space-y-4 my-6">
                  {currentQuestion.promptWord && (
                    <div className="inline-flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                      <span className="text-xs font-extrabold text-amber-900 uppercase tracking-wider">Từ gốc trong ngoặc:</span>
                      <span className="font-mono text-base font-black text-amber-950 bg-white px-3 py-1 rounded-lg border border-amber-200 shadow-xs">
                        {currentQuestion.promptWord}
                      </span>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                      Nhập dạng từ đúng vào đây:
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        value={textInput}
                        disabled={isAnswered && !isEditingAnswer && !isReviewMode}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTextInput(val);
                          try { sessionStorage.setItem(`draft_ans_${questionKey}`, val); } catch (err) {}
                        }}
                        onBlur={() => {
                          if (textInput.trim()) autoCommitTextAnswer(textInput);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleTextAnswerSubmit(textInput);
                          }
                        }}
                        placeholder="Nhập dạng từ (ví dụ: noun, adj, adv...)..."
                        className={cn(
                          "flex-1 p-3.5 rounded-xl border-2 font-bold text-slate-800 text-base outline-none transition-all shadow-inner",
                          isAnswered && !isEditingAnswer ? "bg-slate-50 border-slate-200" : "bg-white border-slate-300 focus:border-indigo-600"
                        )}
                      />
                      {(!isAnswered || isEditingAnswer) && !isReviewMode && (
                        <button
                          type="button"
                          onClick={() => handleTextAnswerSubmit(textInput)}
                          disabled={!textInput.trim()}
                          className="px-6 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-md disabled:opacity-50 text-sm whitespace-nowrap"
                        >
                          Xác nhận
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* DẠNG 3: FILL IN THE BLANK (ĐIỀN TỪ) */}
              {questionType === 'fill_blank' && (
                <div className="space-y-4 my-6">
                  {/* Word bank if available */}
                  {currentQuestion.options && currentQuestion.options.length > 0 && (
                    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-2">
                        Khung từ gợi ý (Word Bank):
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {currentQuestion.options.map((opt, idx) => (
                          <button
                            key={idx}
                            type="button"
                            disabled={isAnswered && !isEditingAnswer}
                            onClick={() => setTextInput(opt)}
                            className="px-3 py-1.5 bg-white border border-slate-200 hover:border-indigo-400 hover:text-indigo-600 rounded-lg text-xs font-bold text-slate-700 transition-all shadow-2xs"
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                      Từ hoặc cụm từ cần điền:
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        value={textInput}
                        disabled={isAnswered && !isEditingAnswer && !isReviewMode}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTextInput(val);
                          try { sessionStorage.setItem(`draft_ans_${questionKey}`, val); } catch (err) {}
                        }}
                        onBlur={() => {
                          if (textInput.trim()) autoCommitTextAnswer(textInput);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleTextAnswerSubmit(textInput);
                          }
                        }}
                        placeholder="Gõ từ cần điền vào chỗ trống..."
                        className={cn(
                          "flex-1 p-3.5 rounded-xl border-2 font-bold text-slate-800 text-base outline-none transition-all shadow-inner",
                          isAnswered && !isEditingAnswer ? "bg-slate-50 border-slate-200" : "bg-white border-slate-300 focus:border-indigo-600"
                        )}
                      />
                      {(!isAnswered || isEditingAnswer) && !isReviewMode && (
                        <button
                          type="button"
                          onClick={() => handleTextAnswerSubmit(textInput)}
                          disabled={!textInput.trim()}
                          className="px-6 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-md disabled:opacity-50 text-sm whitespace-nowrap"
                        >
                          Xác nhận
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* DẠNG 4: SHORT ANSWER (TỰ LUẬN NGẮN) */}
              {questionType === 'short_answer' && (
                <div className="space-y-4 my-6">
                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                      Câu trả lời của bạn:
                    </label>
                    <textarea
                      rows={2}
                      value={textInput}
                      disabled={isAnswered && !isEditingAnswer && !isReviewMode}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTextInput(val);
                        try { sessionStorage.setItem(`draft_ans_${questionKey}`, val); } catch (err) {}
                      }}
                      onBlur={() => {
                        if (textInput.trim()) autoCommitTextAnswer(textInput);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleTextAnswerSubmit(textInput);
                        }
                      }}
                      placeholder="Nhập câu trả lời ngắn của bạn..."
                      className={cn(
                        "w-full p-4 rounded-xl border-2 font-medium text-slate-800 text-base outline-none transition-all resize-none shadow-inner",
                        isAnswered && !isEditingAnswer ? "bg-slate-50 border-slate-200" : "bg-white border-slate-300 focus:border-indigo-600"
                      )}
                    />
                    {(!isAnswered || isEditingAnswer) && !isReviewMode && (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleTextAnswerSubmit(textInput)}
                          disabled={!textInput.trim()}
                          className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-md disabled:opacity-50 text-sm"
                        >
                          Xác nhận
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* DẠNG 5: MULTIPLE CHOICE (TRẮC NGHIỆM KHÁCH QUAN A, B, C, D) */}
              {questionType === 'multiple_choice' && currentQuestion.options && currentQuestion.options.length > 0 && (
                <div className="space-y-3 my-6">
                  {currentQuestion.options.map((option, index) => {
                    const label = String.fromCharCode(65 + index); // A, B, C, D
                    const isSelected = currentAnswer?.selectedOption === index;
                    const isCorrect = index === currentQuestion.correctAnswer;
                    const showResult = isAnswered || isReviewMode;

                    return (
                      <button
                        key={index}
                        onClick={() => handleOptionSelect(index)}
                        disabled={showResult}
                        className={cn(
                          "w-full text-left p-4 rounded-xl border-2 transition-all duration-150 flex items-center gap-4 group",
                          !showResult && "border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 bg-white",
                          showResult && isCorrect && "border-emerald-500 bg-emerald-50 text-emerald-950",
                          showResult && isSelected && !isCorrect && "border-red-400 bg-red-50 text-red-950",
                          showResult && !isSelected && !isCorrect && "border-slate-100 opacity-60 bg-white"
                        )}
                      >
                        <span className={cn(
                          "w-8 h-8 shrink-0 rounded-lg flex items-center justify-center font-bold text-sm transition-colors",
                          !showResult && "bg-slate-100 text-slate-700 group-hover:bg-indigo-100 group-hover:text-indigo-700",
                          showResult && isCorrect && "bg-emerald-600 text-white",
                          showResult && isSelected && !isCorrect && "bg-red-500 text-white",
                          showResult && !isSelected && !isCorrect && "bg-slate-100 text-slate-400"
                        )}>
                          {label}
                        </span>
                        <span className="font-medium flex-1 markdown-body text-slate-800">
                          <Markdown remarkPlugins={[remarkMath]} rehypePlugins={safeRehypePlugins}>
                            {option}
                          </Markdown>
                        </span>
                        {showResult && isCorrect && <span className="text-xl">✅</span>}
                        {showResult && isSelected && !isCorrect && <span className="text-xl">❌</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* FEEDBACK FOR TEXT QUESTIONS */}
              {isTextType && isAnswered && currentAnswer && !isEditingAnswer && (
                <div className={cn(
                  "p-4 md:p-5 rounded-2xl border-2 mt-4 space-y-3",
                  currentAnswer.isCorrect 
                    ? "bg-emerald-50/70 border-emerald-300 text-emerald-950" 
                    : "bg-red-50/70 border-red-300 text-red-950"
                )}>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 font-bold text-base">
                      {currentAnswer.isCorrect ? (
                        <>
                          <span className="text-xl">✅</span>
                          <span>Chính xác! (+{currentQuestion.points || 1} điểm)</span>
                        </>
                      ) : (
                        <>
                          <span className="text-xl">❌</span>
                          <span>Chưa chính xác {currentQuestion.penaltyPoints ? `(-${currentQuestion.penaltyPoints} đ)` : ''}</span>
                        </>
                      )}
                    </div>
                    {!isReviewMode && (
                      <button
                        type="button"
                        onClick={() => setIsEditingAnswer(true)}
                        className="text-xs font-bold text-slate-600 hover:text-indigo-700 underline bg-white px-3 py-1 rounded-lg border border-slate-200"
                      >
                        ✏️ Chỉnh sửa lại bài làm
                      </button>
                    )}
                  </div>

                  <div className="text-sm space-y-1.5 pt-2 border-t border-slate-200/60">
                    <div>
                      <span className="font-bold text-slate-600">✍️ Bài làm của bạn: </span>
                      <span className="font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                        {currentAnswer.textAnswer || '(Chưa điền)'}
                      </span>
                    </div>

                    {(!currentAnswer.isCorrect || isReviewMode) && currentQuestion.correctTextAnswers && currentQuestion.correctTextAnswers.length > 0 && (
                      <div className="text-emerald-900">
                        <span className="font-bold">🎯 Đáp án mẫu chuẩn: </span>
                        <span className="font-bold bg-white px-2 py-0.5 rounded border border-emerald-300 text-emerald-800">
                          {currentQuestion.correctTextAnswers.join(' / ')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Explanation & Navigation */}
            <div className="flex flex-col gap-4">
              <AnimatePresence>
                {(showExplanation || isAnswered || isReviewMode) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className={cn(
                      "rounded-2xl border p-6 md:p-8 shadow-sm",
                      isPaperMode ? "bg-white border-amber-200 font-serif" : "bg-white border-slate-200 font-sans"
                    )}
                  >
                    <div className="flex items-center gap-2 text-indigo-600 mb-3">
                      <span className="text-lg">💡</span>
                      <span className="font-bold uppercase tracking-wider text-xs">Giải thích chi tiết & Hướng dẫn</span>
                    </div>
                    <div className="text-slate-700 leading-relaxed italic markdown-body text-sm md:text-base">
                      <Markdown remarkPlugins={[remarkMath]} rehypePlugins={safeRehypePlugins}>
                        {currentQuestion.explanation}
                      </Markdown>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex items-center justify-between gap-4 pt-2">
                <button
                  onClick={handlePrev}
                  disabled={currentIndex === 0}
                  className="px-6 py-3 rounded-xl font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-30 transition-all flex items-center gap-2 text-sm border border-slate-200 bg-white"
                >
                  <span>⬅️</span>
                  <span>Câu trước</span>
                </button>
                
                <button
                  onClick={handleNext}
                  disabled={!canProceed}
                  className={cn(
                    "px-8 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-md text-sm",
                    canProceed 
                      ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200" 
                      : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                  )}
                >
                  <span>{isLastQuestion ? (isReviewMode ? 'Quay lại kết quả' : 'Hoàn thành bài thi') : 'Câu tiếp theo'}</span>
                  <span>➡️</span>
                </button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
