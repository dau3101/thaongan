import React, { useState } from 'react';
import { PracticeSet } from '../types';
import { CheckCircle2, XCircle, Info, ArrowLeft, Lightbulb } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';

interface PracticeViewProps {
  practiceSets: PracticeSet[];
  onBack: () => void;
}

export const PracticeView: React.FC<PracticeViewProps> = ({ practiceSets, onBack }) => {
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);

  const currentSet = practiceSets[currentSetIndex];
  const currentQuestion = currentSet.questions[currentQuestionIndex];
  
  const isLastQuestionInSet = currentQuestionIndex === currentSet.questions.length - 1;
  const isLastSet = currentSetIndex === practiceSets.length - 1;

  const handleOptionSelect = (index: number) => {
    if (selectedOption !== null) return;
    setSelectedOption(index);
    setShowExplanation(true);
  };

  const handleNext = () => {
    if (isLastQuestionInSet) {
      if (isLastSet) {
        onBack();
      } else {
        setCurrentSetIndex(currentSetIndex + 1);
        setCurrentQuestionIndex(0);
        setSelectedOption(null);
        setShowExplanation(false);
      }
    } else {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setSelectedOption(null);
      setShowExplanation(false);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto p-4 md:p-8">
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 mb-8 font-medium transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Quay lại kết quả
      </button>

      <div className="mb-8">
        <div className="flex items-center gap-2 text-amber-600 mb-2">
          <Lightbulb className="w-5 h-5" />
          <span className="font-bold uppercase tracking-widest text-xs">Phần ôn tập bổ trợ</span>
        </div>
        <h2 className="text-2xl font-black text-slate-800">Chủ đề: {currentSet.topic}</h2>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={`${currentSetIndex}-${currentQuestionIndex}`}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8"
        >
          <p className="text-sm text-slate-400 mb-4 font-medium">Câu hỏi {currentQuestionIndex + 1} / {currentSet.questions.length}</p>
          <h3 className="text-xl font-bold text-slate-800 mb-8 leading-relaxed markdown-body">
            <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex, rehypeRaw]}>
              {currentQuestion.text}
            </Markdown>
          </h3>

          <div className="space-y-3">
            {currentQuestion.options.map((option, index) => {
              const isSelected = selectedOption === index;
              const isCorrect = index === currentQuestion.correctAnswer;
              const showResult = selectedOption !== null;

              return (
                <button
                  key={index}
                  onClick={() => handleOptionSelect(index)}
                  disabled={showResult}
                  className={cn(
                    "w-full text-left p-4 rounded-xl border-2 transition-all duration-200 flex items-center justify-between",
                    !showResult && "border-slate-100 hover:border-amber-200 hover:bg-amber-50/30",
                    showResult && isCorrect && "border-emerald-500 bg-emerald-50 text-emerald-900",
                    showResult && isSelected && !isCorrect && "border-red-500 bg-red-50 text-red-900",
                    showResult && !isSelected && !isCorrect && "border-slate-50 opacity-50"
                  )}
                >
                  <span className="font-medium flex-1 markdown-body">
                    <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex, rehypeRaw]}>
                      {option}
                    </Markdown>
                  </span>
                  {showResult && isCorrect && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                  {showResult && isSelected && !isCorrect && <XCircle className="w-5 h-5 text-red-500" />}
                </button>
              );
            })}
          </div>

          {showExplanation && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8"
            >
              <div className="bg-amber-50 rounded-2xl p-6 border border-amber-100 mb-6">
                <div className="flex items-center gap-2 text-amber-700 mb-2">
                  <Info className="w-4 h-4" />
                  <span className="font-bold text-xs uppercase">Giải thích</span>
                </div>
                <div className="text-amber-900/80 text-sm leading-relaxed italic markdown-body">
                  <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex, rehypeRaw]}>
                    {currentQuestion.explanation}
                  </Markdown>
                </div>
              </div>

              <button
                onClick={handleNext}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 rounded-2xl transition-all"
              >
                {isLastQuestionInSet && isLastSet ? 'Hoàn thành ôn tập' : 'Tiếp tục'}
              </button>
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
