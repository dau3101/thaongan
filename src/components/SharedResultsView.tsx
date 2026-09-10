import React, { useEffect, useState } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { ArrowLeft, Users, Calendar, Trophy, Search, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

interface SharedResultsViewProps {
  testId: string;
  testTitle: string;
  testCode?: string;
  onBack: () => void;
}

interface ResultData {
  id: string;
  studentName: string;
  score: number;
  timeTaken?: number;
  date: string;
}

interface StudentSummary {
  name: string;
  attempts: number;
  averageScore: number;
  bestScore: number;
  totalTime: number;
  lastAttempt: string;
}

export const SharedResultsView: React.FC<SharedResultsViewProps> = ({ testId, testTitle, testCode, onBack }) => {
  const [results, setResults] = useState<ResultData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeView, setActiveView] = useState<'all' | 'summary'>('all');

  useEffect(() => {
    const fetchResults = async () => {
      setIsLoading(true);
      try {
        const q = query(
          collection(db, 'test_results'),
          where('testId', '==', testId)
        );
        const querySnapshot = await getDocs(q);
        const data = querySnapshot.docs.map(doc => doc.data() as ResultData);
        // Sort client-side to avoid index requirement
        data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setResults(data);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'test_results');
      } finally {
        setIsLoading(false);
      }
    };

    fetchResults();
  }, [testId]);

  const formatTime = (seconds?: number) => {
    if (seconds === undefined) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const filteredResults = results.filter(r => 
    r.studentName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const studentSummaries: StudentSummary[] = React.useMemo(() => {
    const summaries: Record<string, StudentSummary> = {};
    
    results.forEach(r => {
      if (!summaries[r.studentName]) {
        summaries[r.studentName] = {
          name: r.studentName,
          attempts: 0,
          averageScore: 0,
          bestScore: 0,
          totalTime: 0,
          lastAttempt: r.date
        };
      }
      
      const s = summaries[r.studentName];
      s.attempts += 1;
      s.averageScore += r.score;
      s.bestScore = Math.max(s.bestScore, r.score);
      s.totalTime += r.timeTaken || 0;
      if (new Date(r.date) > new Date(s.lastAttempt)) {
        s.lastAttempt = r.date;
      }
    });

    return Object.values(summaries).map(s => ({
      ...s,
      averageScore: Number((s.averageScore / s.attempts).toFixed(1))
    })).sort((a, b) => b.averageScore - a.averageScore);
  }, [results]);

  const filteredSummaries = studentSummaries.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const averageScore = results.length > 0 
    ? (results.reduce((acc, r) => acc + r.score, 0) / results.length).toFixed(1)
    : 0;

  return (
    <div className="w-full max-w-5xl mx-auto p-4">
      <button 
        onClick={onBack}
        className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 mb-8 font-medium transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Quay lại thư viện
      </button>

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 mb-2">
            <Users className="w-5 h-5" />
            <span className="font-bold uppercase tracking-widest text-xs">Kết quả học sinh</span>
            {testCode && (
              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-black rounded-full border border-indigo-100">
                Mã: {testCode}
              </span>
            )}
          </div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">{testTitle}</h2>
        </div>

        <div className="flex gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col items-center min-w-[120px]">
            <span className="text-xs font-bold text-slate-400 uppercase">Lượt làm</span>
            <span className="text-2xl font-black text-slate-800">{results.length}</span>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col items-center min-w-[120px]">
            <span className="text-xs font-bold text-slate-400 uppercase">Điểm TB</span>
            <span className="text-2xl font-black text-indigo-600">{averageScore}</span>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1">
            <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm kiếm học sinh..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-4 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>
          
          <div className="flex gap-2 bg-slate-200 p-1 rounded-xl w-fit">
            <button
              onClick={() => setActiveView('all')}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-bold transition-all",
                activeView === 'all' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Tất cả lượt làm
            </button>
            <button
              onClick={() => setActiveView('summary')}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-bold transition-all",
                activeView === 'summary' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Tổng hợp theo HS
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
            <p className="text-slate-500 font-medium">Đang tải kết quả...</p>
          </div>
        ) : (activeView === 'all' ? filteredResults : filteredSummaries).length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-slate-400 font-medium">Chưa có kết quả nào phù hợp.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                  <th className="px-6 py-4">Học sinh</th>
                  {activeView === 'all' ? (
                    <>
                      <th className="px-6 py-4">Điểm số</th>
                      <th className="px-6 py-4">Thời gian</th>
                      <th className="px-6 py-4">Ngày làm bài</th>
                    </>
                  ) : (
                    <>
                      <th className="px-6 py-4">Số lượt làm</th>
                      <th className="px-6 py-4">Điểm TB</th>
                      <th className="px-6 py-4">Điểm cao nhất</th>
                      <th className="px-6 py-4">Lần cuối</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {activeView === 'all' ? (
                  filteredResults.map((result, index) => (
                    <motion.tr 
                      key={result.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-6 py-4 font-bold text-slate-700">{result.studentName}</td>
                      <td className="px-6 py-4">
                        <div className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-bold text-sm",
                          result.score >= 8 ? "bg-green-50 text-green-600" : 
                          result.score >= 5 ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"
                        )}>
                          <Trophy className="w-3.5 h-3.5" />
                          {result.score}/10
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500 font-medium">
                        {formatTime(result.timeTaken)}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          {new Date(result.date).toLocaleString('vi-VN')}
                        </div>
                      </td>
                    </motion.tr>
                  ))
                ) : (
                  filteredSummaries.map((summary, index) => (
                    <motion.tr 
                      key={summary.name}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-6 py-4 font-bold text-slate-700">{summary.name}</td>
                      <td className="px-6 py-4 text-sm text-slate-500 font-bold">{summary.attempts}</td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "font-black",
                          summary.averageScore >= 8 ? "text-green-600" : 
                          summary.averageScore >= 5 ? "text-amber-600" : "text-red-600"
                        )}>
                          {summary.averageScore}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-bold text-slate-700">{summary.bestScore}/10</span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-400">
                        {new Date(summary.lastAttempt).toLocaleString('vi-VN')}
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
