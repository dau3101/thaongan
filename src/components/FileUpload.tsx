import React, { useCallback, useState } from 'react';
import { Upload, FileText, Loader2, AlertCircle, X, Check, Image as ImageIcon, FileAudio } from 'lucide-react';
import { cn } from '../lib/utils';
import mammoth from 'mammoth';

export interface UploadedFile {
  name: string;
  data: string;
  mimeType: string;
  isBase64: boolean;
}

interface FileUploadProps {
  onFileSelect: (files: UploadedFile[], options?: { excludeAudio?: boolean }) => void;
  isLoading: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, isLoading }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stagedFiles, setStagedFiles] = useState<UploadedFile[]>([]);
  const [isProcessingLocal, setIsProcessingLocal] = useState(false);
  const [excludeAudio, setExcludeAudio] = useState<boolean>(true);

  const handleFiles = useCallback(async (fileList: FileList | File[]) => {
    setError(null);
    setIsProcessingLocal(true);
    const files = Array.from(fileList);
    
    if (files.length === 0) {
      setIsProcessingLocal(false);
      return;
    }

    console.log(`Handling ${files.length} files...`);
    
    // Max file size: 100MB
    const MAX_SIZE = 100 * 1024 * 1024;
    
    const parsedFiles: UploadedFile[] = [];

    try {
      for (const file of files) {
        if (file.size > MAX_SIZE) {
          throw new Error(`File ${file.name} quá lớn. Vui lòng chọn file dưới 100MB.`);
        }
        
        const isDocx = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx');
        const isDoc = file.type === 'application/msword' || file.name.endsWith('.doc');
        const isPdf = file.type === 'application/pdf';
        const isTxt = file.type === 'text/plain';
        const isImage = file.type.startsWith('image/');
        const isAudio = file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|m4a|ogg)$/i);
        
        if (!isPdf && !isDocx && !isDoc && !isTxt && !isImage && !isAudio) {
          throw new Error(`File ${file.name} không được hỗ trợ. Chỉ hỗ trợ file PDF, DOCX, Text, Ảnh hoặc Âm Thanh.`);
        }

        if (isDoc) {
          throw new Error('Định dạng .doc cũ không được hỗ trợ trực tiếp. Vui lòng chuyển sang .docx hoặc .pdf.');
        }

        if (isDocx) {
          const arrayBuffer = await file.arrayBuffer();
          const extractedImages: UploadedFile[] = [];

          // Use mammoth image handler to prevent embedding huge base64 strings into HTML text
          const imageHandler = (mammoth as any).images?.imgElement ? (mammoth as any).images.imgElement((element: any) => {
            return element.read("base64").then((imageBuffer: string) => {
              const contentType = element.contentType || "image/png";
              const imgIndex = extractedImages.length + 1;
              extractedImages.push({
                name: `${file.name}-anh-${imgIndex}.${contentType.split('/')[1] || 'png'}`,
                data: imageBuffer,
                mimeType: contentType,
                isBase64: true
              });
              return {
                src: `[Hình ảnh minh họa #${imgIndex}]`
              };
            });
          }) : undefined;

          const options: any = {
            styleMap: [
              "u => u",
              "b => b",
              "i => i"
            ]
          };
          if (imageHandler) {
            options.convertImage = imageHandler;
          }

          const result = await mammoth.convertToHtml({ arrayBuffer }, options);
          if (!result.value.trim()) {
            throw new Error(`File ${file.name} không có nội dung văn bản.`);
          }

          // Strip any residual data:image URIs to guarantee text cleanliness
          const cleanHtml = result.value
            .replace(/src="data:image\/[^;]+;base64,[^"]+"/g, 'src="[Hình ảnh]"')
            .replace(/data:image\/[^"'\s>]{50,}/g, '[Hình ảnh minh họa]');

          parsedFiles.push({ name: file.name, data: cleanHtml, mimeType: 'text/html', isBase64: false });
          if (extractedImages.length > 0) {
            parsedFiles.push(...extractedImages);
          }
        } else if (isTxt) {
          let text = await file.text();
          if (!text.trim()) {
            throw new Error(`File ${file.name} không có nội dung.`);
          }
          text = text.replace(/data:image\/[^"'\s>]{50,}/g, '[Hình ảnh minh họa]');
          parsedFiles.push({ name: file.name, data: text, mimeType: file.type || 'text/plain', isBase64: false });
        } else if (isPdf || isImage || isAudio) {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const b64 = (reader.result as string).split(',')[1];
              if (!b64) reject(new Error(`Không thể đọc nội dung file ${file.name}.`));
              else resolve(b64);
            };
            reader.onerror = () => reject(new Error(`Lỗi khi đọc file ${file.name}.`));
            reader.readAsDataURL(file);
          });
          
          let mime = file.type;
          if (!mime) {
            if (isPdf) mime = 'application/pdf';
            else if (isAudio) mime = 'audio/mpeg';
            else mime = 'image/jpeg';
          }
          parsedFiles.push({ name: file.name, data: base64, mimeType: mime, isBase64: true });
        }
      }

      setStagedFiles(prev => [...prev, ...parsedFiles]);
    } catch (err) {
      console.error('File handling error:', err);
      setError('Có lỗi xảy ra: ' + (err instanceof Error ? err.message : 'Lỗi không xác định'));
    } finally {
      setIsProcessingLocal(false);
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
    // clear value so same file can be selected again
    e.target.value = '';
  }, [handleFiles]);

  const handleRemoveFile = (indexToRemove: number) => {
    setStagedFiles(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSubmit = () => {
    if (stagedFiles.length > 0) {
      onFileSelect(stagedFiles, { excludeAudio });
    }
  };

  const isFormLoading = isLoading || isProcessingLocal;

  return (
    <div className="w-full max-w-2xl mx-auto p-6">
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={cn(
          "relative border-2 border-dashed rounded-2xl p-10 transition-all duration-300 flex flex-col items-center justify-center gap-4 cursor-pointer",
          isDragging ? "border-indigo-500 bg-indigo-50/50" : "border-slate-300 hover:border-indigo-400 hover:bg-slate-50",
          isLoading && "pointer-events-none opacity-60"
        )}
      >
        <input
          type="file"
          multiple
          className="absolute inset-0 opacity-0 cursor-pointer"
          onChange={onChange}
          accept=".pdf,.doc,.docx,.txt,image/*,audio/*"
          disabled={isLoading}
        />
        
        {isLoading ? (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
            <div className="text-center">
              <p className="font-semibold text-slate-800">Đang phân tích hệ thống đề thi...</p>
              <p className="text-sm text-slate-500">AI đang trích xuất câu hỏi và đáp án từ các file</p>
            </div>
          </div>
        ) : (
          <>
            <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
              <Upload className="w-8 h-8" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-slate-800">Tải lên đề thi và đáp án</p>
              <p className="text-slate-500 mt-1 max-w-sm">Kéo thả hoặc click để chọn file đề thi, đáp án (PDF, Word, Ảnh) và file Nghe (Audio)</p>
            </div>
            <div className="flex flex-wrap justify-center gap-3 mt-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl uppercase tracking-wider">
                <FileText className="w-3.5 h-3.5" /> PDF/DOCX
              </div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl uppercase tracking-wider">
                <ImageIcon className="w-3.5 h-3.5" /> ẢNH
              </div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl uppercase tracking-wider">
                <FileAudio className="w-3.5 h-3.5" /> AUDIO
              </div>
            </div>
          </>
        )}
      </div>

      {isProcessingLocal && !isLoading && (
        <div className="mt-4 flex items-center justify-center gap-2 text-indigo-600 font-medium">
          <Loader2 className="w-5 h-5 animate-spin" />
          Đang đọc file...
        </div>
      )}
      
      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-[1rem] flex items-center gap-3 text-red-600 text-sm font-medium">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      {stagedFiles.length > 0 && !isLoading && (
        <div className="mt-8">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center justify-between">
            Tài liệu đã chọn ({stagedFiles.length})
          </h3>
          <ul className="space-y-3 mb-6">
            {stagedFiles.map((file, idx) => {
              const isAudioFile = file.mimeType.startsWith('audio/');
              return (
              <li key={idx} className="flex items-center justify-between bg-white border border-slate-200 p-3 rounded-2xl shadow-sm">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", isAudioFile ? "bg-emerald-50 text-emerald-600" : "bg-indigo-50 text-indigo-600")}>
                    {isAudioFile ? <FileAudio className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                  </div>
                  <span className="font-bold text-slate-700 truncate tracking-tight">{file.name || `File ${idx + 1}`}</span>
                </div>
                <button 
                  onClick={() => handleRemoveFile(idx)}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                  title="Xóa file này"
                >
                  <X className="w-4 h-4" />
                </button>
              </li>
            )})}
          </ul>

          <div className="mb-6 p-4 rounded-2xl bg-amber-50/80 border border-amber-200">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={excludeAudio}
                onChange={(e) => setExcludeAudio(e.target.checked)}
                className="mt-1 w-5 h-5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800 text-sm">📄 Chế độ đề thi chuẩn trên giấy (Loại bỏ âm thanh / Bỏ phần Nghe)</span>
                  <span className="text-[10px] bg-amber-200 text-amber-900 font-extrabold px-2 py-0.5 rounded-full uppercase">Đề xuất</span>
                </div>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Giữ nguyên dạng bài gốc như tài liệu trên giấy: <strong>viết lại câu, điền từ, loại từ, trắc nghiệm</strong>. Bỏ qua các câu hỏi yêu cầu file âm thanh để học sinh làm bài tập trung như trên giấy thi.
                </p>
              </div>
            </label>
          </div>

          <button 
            onClick={handleSubmit}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white font-black py-4 px-6 rounded-2xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 active:scale-[0.98]"
          >
            <Check className="w-5 h-5" />
            TẠO ĐỀ THI TỪ {stagedFiles.length} FILE NÀY
          </button>
        </div>
      )}
    </div>
  );
};
