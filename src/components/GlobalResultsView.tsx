import React, { useEffect, useState, useMemo } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { ArrowLeft, Users, Calendar, Trophy, Search, Loader2, BookOpen, Clock, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { TestData } from '../types';

interface GlobalResultsViewProps {
  currentUserUid: string;
  myTests: TestData[];
  onBack: () => void;
  onSelectTest: (test: TestData) => void;
}

interface ResultData {
  id: string;
  testId: string;
  testTitle?: string;
  studentName: string;
  score: number;
  timeTaken?: number;
  date: string;
}

interface StudentGlobalSummary {
  name: string;
  totalAttempts: number;
  averageScore: number;
  bestScore: number;
  testsTaken: Set<string>;
  testDetails: {
    testId: string;
    testTitle: string;
    score: number;
    date: string;
  }[];
  lastActivity: string;
}

export const GlobalResultsView: React.FC<GlobalResultsViewProps> = ({ 
  currentUserUid, 
  myTests, 
  onBack,
  onSelectTest
}) => {
  const [results, setResults] = useState<ResultData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<StudentGlobalSummary | null>(null);

  useEffect(() => {
    const fetchAllResults = async () => {
      setIsLoading(true);
      try {
        // Query by teacherUid (for new results)
        const qNew = query(
          collection(db, 'test_results'),
          where('teacherUid', '==', currentUserUid)
        );
        
        const querySnapshot = await getDocs(qNew);
        let allResults = querySnapshot.docs.map(doc => doc.data() as ResultData);

        // FALLBACK: If results are empty OR we want to be thorough,
        // search by all individual testIds in the teacher's library.
        // This is necessary for results saved before the "teacherUid" field was added.
        if (myTests.length > 0) {
          const testIds = myTests.map(t => t.id);
          // Firestore 'in' query has a limit of 30, so we batch it if needed
          const batches = [];
          for (let i = 0; i < testIds.length; i += 30) {
            batches.push(testIds.slice(i, i + 30));
          }

          const fallbackPromises = batches.map(batch => 
            getDocs(query(collection(db, 'test_results'), where('testId', 'in', batch)))
          );

          const fallbackSnapshots = await Promise.all(fallbackPromises);
          const fallbackResults = fallbackSnapshots.flatMap(snap => snap.docs.map(doc => doc.data() as ResultData));
          
          // Merge and deduplicate by result ID
          const mergedResults = [...allResults];
          const seenIds = new Set(allResults.map(r => r.id));
          
          fallbackResults.forEach(r => {
            if (!seenIds.has(r.id)) {
              mergedResults.push(r);
              seenIds.add(r.id);
            }
          });

          allResults = mergedResults;
        }

        // Final sort
        allResults.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setResults(allResults);
      } catch (error) {
        console.error('Error fetching global results:', error);
        // Silent fail or handled error
      } finally {
        setIsLoading(false);
      }
    };

    fetchAllResults();
  }, [currentUserUid, myTests]);

  const studentSummaries: StudentGlobalSummary[] = useMemo(() => {
    const summaries: Record<string, StudentGlobalSummary> = {};
    
    results.forEach(r => {
      const name = r.studentName || 'Ẩn danh';
      if (!summaries[name]) {
        summaries[name] = {
          name,
          totalAttempts: 0,
          averageScore: 0,
          bestScore: 0,
          testsTaken: new Set(),
          testDetails: [],
          lastActivity: r.date
        };
      }
      
      const s = summaries[name];
      const testInfo = myTests.find(t => t.id === r.testId);
      const testTitle = r.testTitle || testInfo?.title || 'Đề thi không xác định';

      s.totalAttempts += 1;
      s.averageScore += r.score;
      s.bestScore = Math.max(s.bestScore, r.score);
      s.testsTaken.add(r.testId);
      s.testDetails.push({
        testId: r.testId,
        testTitle,
        score: r.score,
        date: r.date
      });
      
      if (new Date(r.date) > new Date(s.lastActivity)) {
        s.lastActivity = r.date;
      }
    });

    return Object.values(summaries).map(s => ({
      ...s,
      averageScore: Number((s.averageScore / s.totalAttempts).toFixed(1)),
      // Sort details by date desc
      testDetails: s.testDetails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    })).sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());
  }, [results, myTests]);

  const filteredSummaries = studentSummaries.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (selectedStudent) {
    return (
      <div className="w-full max-w-4xl mx-auto p-4">
        <button 
          onClick={() => setSelectedStudent(null)}
          className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 mb-8 font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Quay lại danh sách học sinh
        </button>

        <div className="bg-white border border-slate-200 rounded-3xl p-8 mb-8 shadow-sm">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600">
              <Users className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-3xl font-black text-slate-800 tracking-tight">{selectedStudent.name}</h2>
              <p className="text-slate-500 font-medium">Lịch sử làm bài chi tiết</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-50 rounded-2xl p-4">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Số đề đã làm</span>
              <span className="text-xl font-black text-slate-800">{selectedStudent.testsTaken.size}</span>
            </div>
            <div className="bg-slate-50 rounded-2xl p-4">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Tổng lượt làm</span>
              <span className="text-xl font-black text-slate-800">{selectedStudent.totalAttempts}</span>
            </div>
            <div className="bg-slate-50 rounded-2xl p-4">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Điểm trung bình</span>
              <span className="text-xl font-black text-indigo-600">{selectedStudent.averageScore}</span>
            </div>
            <div className="bg-slate-50 rounded-2xl p-4">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Điểm cao nhất</span>
              <span className="text-xl font-black text-emerald-600">{selectedStudent.bestScore}/10</span>
            </div>
          </div>
        </div>

        <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-indigo-600" />
          Các lượt làm bài gần đây
        </h3>

        <div className="space-y-4">
          {selectedStudent.testDetails.map((detail, idx) => (
            <div 
              key={idx}
              className="group bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-lg transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div>
                <h4 className="font-bold text-slate-800 mb-1 group-hover:text-indigo-600 transition-colors">{detail.testTitle}</h4>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(detail.date).toLocaleString('vi-VN')}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className={cn(
                  "px-4 py-2 rounded-xl font-black text-lg",
                  detail.score >= 8 ? "bg-green-50 text-green-600" :
                  detail.score >= 5 ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"
                )}>
                  {detail.score}/10
                </div>
                <button 
                  onClick={() => {
                    const test = myTests.find(t => t.id === detail.testId);
                    if (test) onSelectTest(test);
                  }}
                  className="p-3 bg-slate-50 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                  title="Xem bộ đề này"
                >
                  <BookOpen className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

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
            <Users className="w-6 h-6" />
            <span className="font-bold uppercase tracking-widest text-xs">Thống kê học tập</span>
          </div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">Lịch sử làm bài theo Học sinh</h2>
          <p className="text-slate-500 font-medium">Theo dõi tiến độ và điểm số của từng cá nhân</p>
        </div>

        <div className="bg-indigo-600 text-white px-6 py-4 rounded-3xl shadow-lg shadow-indigo-100 flex items-center gap-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-widest opacity-70">Tổng số học sinh</span>
            <span className="text-2xl font-black">{studentSummaries.length}</span>
          </div>
          <div className="w-px h-8 bg-white/20" />
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-widest opacity-70">Tổng lượt làm bài</span>
            <span className="text-2xl font-black">{results.length}</span>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
          <div className="relative">
            <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm kiếm theo tên học sinh..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl py-4 pl-12 pr-4 focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
            <p className="text-slate-500 font-medium">Đang tải dữ liệu học sinh...</p>
          </div>
        ) : filteredSummaries.length === 0 ? (
          <div className="py-20 text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
              <Users className="w-8 h-8" />
            </div>
            <p className="text-slate-400 font-medium">Chưa có dữ liệu học sinh nào.</p>
            <p className="text-slate-400 text-xs mt-1">Hãy chia sẻ link bài tập cho học sinh để bắt đầu thu thập kết quả.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                  <th className="px-6 py-4">Học sinh</th>
                  <th className="px-6 py-4 text-center">Đề đã làm</th>
                  <th className="px-6 py-4 text-center">Tổng lượt làm</th>
                  <th className="px-6 py-4 text-center">Điểm TB</th>
                  <th className="px-6 py-4 text-center">Điểm cao nhất</th>
                  <th className="px-6 py-4">Hoạt động cuối</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody>
                {filteredSummaries.map((summary, index) => (
                  <motion.tr 
                    key={summary.name}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="border-b border-slate-50 hover:bg-slate-50 transition-colors group cursor-pointer"
                    onClick={() => setSelectedStudent(summary)}
                  >
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 font-black text-xs uppercase">
                          {summary.name.charAt(0)}
                        </div>
                        <span className="font-bold text-slate-700 group-hover:text-indigo-600 transition-colors uppercase text-sm">{summary.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <span className="bg-slate-100 text-slate-600 text-xs px-2.5 py-1 rounded-lg font-black">
                        {summary.testsTaken.size}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-center text-sm font-bold text-slate-500">{summary.totalAttempts}</td>
                    <td className="px-6 py-5 text-center">
                      <span className={cn(
                        "font-black text-sm",
                        summary.averageScore >= 8 ? "text-green-600" : 
                        summary.averageScore >= 5 ? "text-amber-600" : "text-red-600"
                      )}>
                        {summary.averageScore}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <Trophy className="w-3.5 h-3.5 text-amber-500" />
                        <span className="font-black text-slate-700">{summary.bestScore}/10</span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-xs text-slate-400 font-medium">
                      {new Date(summary.lastActivity).toLocaleString('vi-VN', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="w-8 h-8 rounded-full bg-transparent group-hover:bg-indigo-600 group-hover:text-white flex items-center justify-center transition-all">
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
