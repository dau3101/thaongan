import React, { useEffect } from 'react';
import { TestData, UserAnswer } from '../types';
import confetti from 'canvas-confetti';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

interface ResultViewProps {
  testData: TestData;
  answers: UserAnswer[];
  onPractice: () => void;
  onRestart: () => void;
  onRedo: () => void;
  onReview: () => void;
  userName?: string;
  onShare?: (test: TestData) => void;
  isLoggedIn?: boolean;
}

export const ResultView: React.FC<ResultViewProps> = ({ 
  testData, 
  answers, 
  onPractice, 
  onRestart, 
  onRedo,
  onReview,
  userName,
  onShare,
  isLoggedIn
}) => {
  const correctCount = answers.filter(a => a.isCorrect).length;
  
  // Calculate detailed points based on barem
  let correctPointsSum = 0;
  let penaltyPointsSum = 0;
  let totalAvailablePoints = 0;

  testData.questions.forEach((q, idx) => {
    const qId = q.id || `q-${idx}`;
    const qPoints = typeof q.points === 'number' ? q.points : (10 / testData.questions.length);
    const qPenalty = typeof q.penaltyPoints === 'number' ? q.penaltyPoints : 0;
    
    totalAvailablePoints += qPoints;
    
    const ans = answers.find(a => a.questionId === qId);
    if (ans) {
      if (ans.isCorrect) {
        correctPointsSum += qPoints;
      } else {
        penaltyPointsSum += qPenalty;
      }
    }
  });

  const maxScore = Math.round(totalAvailablePoints * 100) / 100;
  const rawScore = correctPointsSum - penaltyPointsSum;
  const score = Math.max(0, Math.round(rawScore * 100) / 100);
  const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

  useEffect(() => {
    if (percentage >= 70) {
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#4F46E5', '#10B981', '#F59E0B']
      });
    }
  }, [percentage]);

  const failedTopics = Array.from(new Set(
    answers.filter(a => !a.isCorrect).map(a => {
      const q = testData.questions.find((_, i) => i.toString() === a.questionId || (testData.questions[i].id === a.questionId));
      return q?.topic || 'Chung';
    })
  ));

  const isLowScore = score < (maxScore / 2);

  return (
    <div className="w-full max-w-4xl mx-auto p-4 md:p-8">
      <div className="grid md:grid-cols-3 gap-8">
        {/* Score Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="md:col-span-1 bg-white rounded-3xl p-8 shadow-xl border border-slate-100 flex flex-col items-center text-center"
        >
          <div className={cn(
            "w-20 h-20 rounded-full flex items-center justify-center mb-4 text-3xl",
            isLowScore ? "bg-red-50" : "bg-indigo-50"
          )}>
            {isLowScore ? "⚠️" : "🏆"}
          </div>
          
          <div className="mb-4 px-3 py-1 bg-slate-100 rounded-full text-[10px] font-black text-slate-500 uppercase tracking-widest border border-slate-200">
            Mã bộ đề: {testData.testCode || 'N/A'}
          </div>

          <h3 className="text-slate-500 font-medium mb-1">
            {userName ? `${userName}, điểm của bạn` : 'Điểm của bạn'}
          </h3>
          <div className={cn(
            "text-6xl font-black mb-2",
            isLowScore ? "text-red-600" : "text-slate-800"
          )}>
            {score}<span className="text-2xl text-slate-400">/{maxScore}</span>
          </div>
          <p className="text-sm text-slate-500 mb-4">Bạn đã đúng {correctCount}/{testData.questions.length} câu hỏi</p>
          
          {/* Detailed Points Breakdown */}
          <div className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3.5 mb-6 text-xs text-left text-slate-600 space-y-1.5 shadow-inner">
            <div className="flex justify-between">
              <span>Đúng ({correctCount} câu):</span> 
              <span className="font-extrabold text-emerald-600">+{Math.round(correctPointsSum * 100) / 100} đ</span>
            </div>
            {penaltyPointsSum > 0 && (
              <div className="flex justify-between">
                <span>Sai bị trừ ({testData.questions.length - correctCount} câu):</span> 
                <span className="font-extrabold text-rose-500">-{Math.round(penaltyPointsSum * 100) / 100} đ</span>
              </div>
            )}
            <div className="border-t border-dashed border-slate-200 pt-1.5 mt-1 flex justify-between font-black text-slate-700">
              <span>Thang điểm tối đa:</span>
              <span>{maxScore} đ</span>
            </div>
          </div>
          
          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mb-8">
            <div className={cn(
              "h-full transition-all duration-1000",
              isLowScore ? "bg-red-500" : "bg-indigo-600"
            )} style={{ width: `${percentage}%` }} />
          </div>

          <div className="space-y-3 w-full">
            <button 
              onClick={onRedo}
              className={cn(
                "w-full py-4 px-4 font-bold rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg",
                isLowScore ? "bg-red-600 hover:bg-red-700 text-white shadow-red-200" : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200"
              )}
            >
              <span>🔄</span> Làm lại bài thi
            </button>
            <button 
              onClick={onReview}
              className="w-full py-3 px-4 bg-white border-2 border-indigo-100 text-indigo-600 hover:bg-indigo-50 font-bold rounded-xl flex items-center justify-center gap-2 transition-all"
            >
              <span>🔍</span> Xem lại bài làm
            </button>
            <button 
              onClick={onRestart}
              className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl flex items-center justify-center gap-2 transition-all border border-slate-200"
            >
              <span>🏠</span> Quay lại thư viện
            </button>
            
            {onShare && (
              <button 
                onClick={() => {
                  if (isLoggedIn) {
                    onShare(testData);
                  } else {
                    alert('Vui lòng đăng nhập để sử dụng tính năng chia sẻ đề thi cho học sinh.');
                  }
                }}
                className={cn(
                  "w-full py-3 px-4 font-bold rounded-xl flex items-center justify-center gap-2 transition-all border-2",
                  isLoggedIn 
                    ? "border-indigo-100 text-indigo-600 hover:bg-indigo-50" 
                    : "border-slate-100 text-slate-300 hover:text-slate-400 hover:bg-slate-50"
                )}
                title={isLoggedIn ? "Chia sẻ đề thi này cho học sinh" : "Đăng nhập để chia sẻ đề thi"}
              >
                <span>📤</span> Chia sẻ đề thi
              </button>
            )}
            {isLowScore && (
              <p className="text-xs text-red-500 font-medium mt-2 italic">
                Điểm của bạn hơi thấp, hãy thử làm lại để cải thiện nhé!
              </p>
            )}
          </div>
        </motion.div>

        {/* Analysis Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="md:col-span-2 space-y-6"
        >
          <div className="bg-white rounded-3xl p-8 shadow-xl border border-slate-100">
            <div className="flex items-center gap-3 mb-6">
              <span className="text-2xl">🎯</span>
              <h3 className="text-xl font-bold text-slate-800">Phân tích kết quả</h3>
            </div>

            {failedTopics.length > 0 ? (
              <>
                <p className="text-slate-600 mb-4">Bạn cần chú ý ôn tập thêm các chủ đề sau:</p>
                <div className="flex flex-wrap gap-2 mb-8">
                  {failedTopics.map((topic, i) => (
                    <span key={i} className="px-4 py-2 bg-red-50 text-red-700 text-sm font-bold rounded-full border border-red-100 flex items-center gap-2">
                      <span>⚠️</span> {topic}
                    </span>
                  ))}
                </div>
                
                <div className="bg-indigo-600 rounded-2xl p-6 text-white">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-white/20 rounded-xl text-2xl">
                      📖
                    </div>
                    <div>
                      <h4 className="font-bold text-lg mb-1">Luyện tập cá nhân hóa</h4>
                      <p className="text-indigo-100 text-sm mb-4">AI đã chuẩn bị các bài tập tương tự dựa trên những lỗi sai của bạn để giúp bạn ghi nhớ tốt hơn.</p>
                      <button 
                        onClick={onPractice}
                        className="bg-white text-indigo-600 hover:bg-indigo-50 px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all"
                      >
                        Bắt đầu ôn tập ngay <span>➡️</span>
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-10">
                <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">
                  🏆
                </div>
                <h4 className="text-xl font-bold text-slate-800 mb-2">Tuyệt vời!</h4>
                <p className="text-slate-500">Bạn đã trả lời đúng tất cả các câu hỏi. Hãy tiếp tục phát huy nhé!</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};
