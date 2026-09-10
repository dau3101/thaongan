import React, { useState } from 'react';
import { TestData } from '../types';
import { BookOpen, Calendar, ChevronRight, Trash2, Plus, Share2, Users, LayoutGrid, List, Edit2, Hash, Folder, FolderPlus, MoreVertical, Archive, ArrowRightLeft, CheckCircle2, ArrowUpDown } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { EditTitleModal } from './EditTitleModal';

interface TestLibraryProps {
  tests: TestData[];
  publicTests: TestData[];
  emptyCategories?: string[];
  onSelect: (test: TestData) => void;
  onDelete: (id: string) => void;
  onEditTitle: (id: string, newTitle: string) => void;
  onUpdateCategory: (id: string, category: string) => void;
  onAddCategory: (name: string) => void;
  onDeleteCategory: (name: string) => void;
  onRenameCategory: (oldName: string, newName: string) => void;
  onMergeCategories: (source: string, target: string) => void;
  onUploadNew: () => void;
  onShare: (test: TestData) => void;
  onViewResults: (test: TestData) => void;
  onViewGlobalResults: () => void;
  isLoggedIn: boolean;
  currentUserUid?: string;
}

export const TestLibrary: React.FC<TestLibraryProps> = ({ 
  tests, 
  publicTests,
  emptyCategories = [],
  onSelect, 
  onDelete, 
  onEditTitle,
  onUpdateCategory,
  onAddCategory,
  onDeleteCategory,
  onRenameCategory,
  onMergeCategories,
  onUploadNew, 
  onShare, 
  onViewResults,
  onViewGlobalResults,
  isLoggedIn,
  currentUserUid
}) => {
  const [activeTab, setActiveTab] = React.useState<'personal' | 'public'>(tests.length > 0 ? 'personal' : 'public');
  const [viewMode, setViewMode] = React.useState<'grid' | 'list'>('grid');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [editingTest, setEditingTest] = useState<{ id: string, title: string } | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isManagingCategories, setIsManagingCategories] = useState(false);
  const [editingCategory, setEditingCategory] = useState<{ oldName: string, newName: string } | null>(null);
  const [mergingCategory, setMergingCategory] = useState<{ source: string, target: string } | null>(null);
  const [movingTest, setMovingTest] = useState<TestData | null>(null);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [testToMoveAfterAdd, setTestToMoveAfterAdd] = useState<string | null>(null);

  const libraryCategories = Array.from(new Set(tests.map(t => t.category).filter(Boolean))) as string[];
  const publicCategories = Array.from(new Set(publicTests.map(t => t.category).filter(Boolean))) as string[];
  const allCategories = Array.from(new Set([...libraryCategories, ...publicCategories, ...emptyCategories])).sort();
  
  const parsedTime = (d: string | undefined | null) => {
    if (!d) return 0;
    const time = new Date(d).getTime();
    return isNaN(time) ? 0 : time;
  };

  const displayTests = (activeTab === 'personal' ? tests : publicTests)
    .filter(t => !selectedCategory || t.category === selectedCategory)
    .sort((a, b) => {
      const timeA = parsedTime(a.date);
      const timeB = parsedTime(b.date);
      return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
    });

  const handleCategoryRename = () => {
    if (editingCategory && editingCategory.newName.trim()) {
      onRenameCategory(editingCategory.oldName, editingCategory.newName.trim());
      setEditingCategory(null);
    }
  };

  const handleCategoryMerge = () => {
    if (mergingCategory && mergingCategory.target) {
      onMergeCategories(mergingCategory.source, mergingCategory.target);
      setMergingCategory(null);
    }
  };

  React.useEffect(() => {
    if (tests.length > 0 && activeTab === 'public' && tests.length === 1) {
      setActiveTab('personal');
    }
  }, [tests.length]);

  const handleAddCategorySubmit = () => {
    if (newCategoryName.trim()) {
      const name = newCategoryName.trim();
      onAddCategory(name);
      if (testToMoveAfterAdd) {
        onUpdateCategory(testToMoveAfterAdd, name);
      }
      setNewCategoryName('');
      setIsAddingCategory(false);
      setTestToMoveAfterAdd(null);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight uppercase">Thư viện đề thi</h2>
          <p className="text-slate-500 font-medium">Bắt đầu ôn luyện ngay hôm nay</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isLoggedIn && tests.length > 0 && (
            <button
              onClick={onViewGlobalResults}
              className="flex items-center gap-2 bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-50 px-6 py-3 rounded-2xl font-bold transition-all shadow-sm active:scale-95"
            >
              <Users className="w-5 h-5" />
              <span>Báo cáo tổng hợp</span>
            </button>
          )}
          <button
            onClick={onUploadNew}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl font-bold transition-all shadow-lg shadow-indigo-100 active:scale-95"
          >
            <Plus className="w-5 h-5" />
            <span>Tải đề mới</span>
          </button>
        </div>
      </div>

      {isLoggedIn && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 mb-8 flex items-start gap-4">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shrink-0 shadow-sm">
            <Users className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h4 className="font-bold text-indigo-900 text-sm">Mẹo cho Giáo viên:</h4>
            <p className="text-indigo-700 text-xs leading-relaxed">
              Nhấn vào biểu tượng <strong>Chia sẻ</strong> (<Share2 className="w-3 h-3 inline" />) để gửi link cho học sinh. 
              Sau khi học sinh làm bài, nhấn vào biểu tượng <strong>Báo cáo</strong> (<Users className="w-3 h-3 inline" />) trên đề thi đó để xem thống kê điểm số và thời gian làm bài của từng em.
            </p>
          </div>
        </div>
      )}

        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        {/* Tabs */}
        <div className="flex gap-2 bg-slate-100 p-1.5 rounded-2xl w-fit">
          <button
            onClick={() => {
              setActiveTab('personal');
              setSelectedCategory(null);
            }}
            className={cn(
              "px-6 py-2.5 rounded-xl font-bold transition-all text-sm flex items-center gap-2",
              activeTab === 'personal' 
                ? "bg-white text-indigo-600 shadow-sm" 
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            <BookOpen className="w-4 h-4" />
            Cá nhân ({tests.length})
          </button>
          <button
            onClick={() => {
              setActiveTab('public');
              setSelectedCategory(null);
            }}
            className={cn(
              "px-6 py-2.5 rounded-xl font-bold transition-all text-sm flex items-center gap-2",
              activeTab === 'public' 
                ? "bg-white text-indigo-600 shadow-sm" 
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            <Users className="w-4 h-4" />
            Cộng đồng ({publicTests.length})
          </button>
        </div>

        {/* Sorting and View Mode controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Sort order toggle */}
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl items-center text-xs">
            <span className="text-slate-400 font-extrabold px-2.5 uppercase tracking-wider text-[10px] whitespace-nowrap">Thời gian:</span>
            <button
              onClick={() => setSortOrder('asc')}
              className={cn(
                "px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5",
                sortOrder === 'asc' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
              title="Thời gian: Từ nhỏ đến lớn (Cũ nhất trước)"
            >
              <ArrowUpDown className="w-3.5 h-3.5 shrink-0" />
              <span>Cũ nhất</span>
            </button>
            <button
              onClick={() => setSortOrder('desc')}
              className={cn(
                "px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5",
                sortOrder === 'desc' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
              title="Thời gian: Từ lớn đến nhỏ (Mới nhất trước)"
            >
              <ArrowUpDown className="w-3.5 h-3.5 shrink-0" />
              <span>Mới nhất</span>
            </button>
          </div>

          {/* View Mode Toggle */}
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                "p-2 rounded-lg transition-all",
                viewMode === 'grid' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}
              title="Dạng lưới"
            >
              <LayoutGrid className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                "p-2 rounded-lg transition-all",
                viewMode === 'list' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}
              title="Dạng danh sách"
            >
              <List className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Categories / Cabinets */}
      <div className="mb-8 overflow-hidden">
        <div className="flex items-center justify-between mb-4 mt-2">
          <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
            <Archive className="w-3.5 h-3.5" />
            Hộc tủ đề thi
          </h4>
          <div className="flex gap-4">
            <button 
              onClick={() => setIsManagingCategories(!isManagingCategories)}
              className="text-[10px] uppercase font-black text-indigo-600 hover:text-indigo-700 tracking-wider transition-colors"
            >
              {isManagingCategories ? 'HOÀN TẤT' : 'QUẢN LÝ HỘC TỦ'}
            </button>
          </div>
        </div>
          <div className="flex flex-wrap gap-2 pb-2">
            <button
              onClick={() => setSelectedCategory(null)}
              className={cn(
                "px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all border-2",
                selectedCategory === null 
                  ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100" 
                  : "bg-white text-slate-400 border-slate-100 hover:border-slate-200 hover:text-slate-600"
              )}
            >
              Tất cả
            </button>
            {allCategories.map(cat => (
              <div key={cat} className="group relative">
                <button
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    "px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all border-2 flex items-center gap-2",
                    isManagingCategories && "pr-14",
                    selectedCategory === cat 
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100" 
                      : "bg-white text-slate-400 border-slate-100 hover:border-slate-200 hover:text-slate-600"
                  )}
                >
                  <Folder className="w-3.5 h-3.5 opacity-60" />
                  {cat}
                </button>
                {isManagingCategories && (
                  <div className={cn(
                    "absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5",
                    selectedCategory === cat ? "text-white" : "text-slate-300"
                  )}>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingCategory({ oldName: cat, newName: cat });
                      }}
                      className="p-1 hover:bg-black/5 rounded-lg transition-colors"
                      title="Đổi tên"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setMergingCategory({ source: cat, target: '' });
                      }}
                      className="p-1 hover:bg-black/5 rounded-lg transition-colors"
                      title="Dồn hộc tủ"
                    >
                      <ArrowRightLeft className="w-3 h-3" />
                    </button>
                    {!libraryCategories.includes(cat) && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteCategory(cat);
                        }}
                        className="p-1 hover:bg-red-50 text-red-400 rounded-lg transition-colors"
                        title="Xóa hộc tủ trống"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
            <button
              onClick={() => setIsAddingCategory(true)}
              className="px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider border-2 border-dashed border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-all flex items-center gap-2 group/add"
            >
              <FolderPlus className="w-3.5 h-3.5 group-hover/add:scale-110 transition-transform" />
              Thêm hộc tủ
            </button>
          </div>
        </div>

      {displayTests.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
            {activeTab === 'personal' ? (
              <BookOpen className="w-10 h-10 text-slate-300" />
            ) : (
              <Users className="w-10 h-10 text-slate-300" />
            )}
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">
            {activeTab === 'personal' 
              ? (selectedCategory ? `Hộc tủ trống` : `Chưa có đề thi nào`) 
              : 'Chưa có đề thi cộng đồng'}
          </h3>
          <p className="text-slate-500 mb-8 max-w-sm mx-auto">
            {activeTab === 'personal' 
              ? (selectedCategory 
                  ? `Chưa có đề thi nào trong hộc tủ "${selectedCategory}". Hãy chọn "Tất cả" để xem các đề và phân loại vào đây.` 
                  : 'Hãy tải lên tài liệu học tập của bạn để AI giúp bạn tạo các bài kiểm tra ôn luyện cá nhân hóa.')
              : 'Hiện chưa có đề thi nào được chia sẻ công khai. Nếu bạn là giáo viên, hãy tải đề lên và nhấn nút Chia sẻ để học sinh có thể thấy ở đây.'}
          </p>
          {activeTab === 'personal' ? (
            <div className="flex flex-col items-center gap-4">
              {selectedCategory && (
                <button
                  onClick={() => setSelectedCategory(null)}
                  className="px-6 py-3 bg-indigo-50 text-indigo-600 rounded-xl font-bold hover:bg-indigo-100 transition-colors"
                >
                  Xem tất cả đề thi
                </button>
              )}
              {!selectedCategory && (
                <button
                  onClick={onUploadNew}
                  className="text-indigo-600 font-bold hover:underline"
                >
                  Bắt đầu tải lên ngay
                </button>
              )}
              {publicTests.length > 0 && !selectedCategory && (
                <button
                  onClick={() => setActiveTab('public')}
                  className="text-slate-400 text-sm hover:text-indigo-600 transition-colors"
                >
                  Hoặc xem các đề thi cộng đồng ({publicTests.length})
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={() => setActiveTab('personal')}
              className="text-indigo-600 font-bold hover:underline"
            >
              Quay lại thư viện cá nhân
            </button>
          )}
        </div>
      ) : (
        <div className={cn(
          "grid gap-4",
          viewMode === 'grid' ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"
        )}>
          {displayTests.map((test, index) => (
            <motion.div
              key={test.id + activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index * 0.03, 0.3) }}
              className={cn(
                "group bg-white border border-slate-200 rounded-3xl hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-50/50 transition-all cursor-pointer relative",
                viewMode === 'grid' ? "p-6" : "p-4 flex items-center gap-4"
              )}
              onClick={() => onSelect(test)}
            >
              <div className={cn(
                "bg-indigo-50 rounded-2xl text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors flex items-center justify-center shrink-0",
                viewMode === 'grid' ? "w-12 h-12 mb-4" : "w-10 h-10"
              )}>
                <BookOpen className={viewMode === 'grid' ? "w-6 h-6" : "w-5 h-5"} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-1 gap-2">
                  <div className="min-w-0">
                    <h3 className={cn(
                      "font-black text-slate-800 break-words group-hover:text-indigo-600 transition-all",
                      viewMode === 'grid' ? "text-sm mb-1 leading-snug" : "text-xs"
                    )}>
                      {test.title}
                    </h3>
                    
                    {activeTab === 'personal' && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); setMovingTest(test); }}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-xl mb-2.5 transition-all border shadow-sm w-fit cursor-pointer",
                          test.category 
                            ? "bg-indigo-50 text-indigo-700 border-indigo-100 hover:bg-indigo-100 hover:border-indigo-200 hover:scale-[1.02]" 
                            : "bg-amber-50 text-amber-750 border-amber-200 hover:bg-amber-100 hover:border-amber-300 border-dashed animate-pulse hover:scale-[1.02]"
                        )}
                        title="Nhấn vào để chuyển hộc tủ cho đề thi này"
                      >
                        <Folder className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Hộc tủ: <span className="font-extrabold text-slate-850">{test.category || 'Chưa phân loại'}</span></span>
                        <span className="text-[9px] text-slate-400 font-normal normal-case ml-1 border-l pl-1.5 border-indigo-200">Nhấp để đổi</span>
                      </button>
                    )}
                    {activeTab !== 'personal' && test.category && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-500 text-[9px] font-black uppercase tracking-wider rounded-md mb-2">
                        <Archive className="w-2.5 h-2.5" />
                        {test.category}
                      </span>
                    )}
                  </div>
                  
                  {viewMode === 'grid' && (
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      {activeTab === 'public' && (
                        <span className="px-2 py-0.5 bg-green-50 text-green-600 text-[10px] font-bold rounded-full border border-green-100">
                          Cộng đồng
                        </span>
                      )}
                      {activeTab === 'personal' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMovingTest(test);
                          }}
                          className="flex items-center gap-1 px-2 py-1 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 rounded-lg transition-all font-bold text-[10px]"
                          title="Chuyển hộc tủ"
                        >
                          <Folder className="w-3.5 h-3.5 text-indigo-500" />
                          <span>Chuyển hộc</span>
                        </button>
                      )}
                      {(activeTab === 'personal' || test.authorUid === currentUserUid) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingTest({ id: test.id, title: test.title });
                          }}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                          title="Sửa tiêu đề"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isLoggedIn) {
                            onShare(test);
                          } else {
                            onSelect(test); // Fallback to select if not shared
                          }
                        }}
                        className={cn(
                          "p-1.5 rounded-lg transition-all",
                          isLoggedIn 
                            ? "text-slate-400 hover:text-indigo-600 hover:bg-indigo-50" 
                            : "text-slate-300 hover:text-slate-400 hover:bg-slate-50"
                        )}
                        title={isLoggedIn ? "Chia sẻ đề thi" : "Đăng nhập để chia sẻ đề thi"}
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                      {test.authorUid === currentUserUid && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewResults(test);
                          }}
                          className="flex items-center gap-1.5 px-2 py-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all border border-indigo-100"
                          title="Xem báo cáo kết quả học sinh (Thống kê điểm & thời gian)"
                        >
                          <Users className="w-4 h-4" />
                          <span className="text-[10px] font-bold">Báo cáo</span>
                        </button>
                      )}
                      {(activeTab === 'personal' || test.authorUid === currentUserUid) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(test.id);
                          }}
                          className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                          title="Xóa đề thi này"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-500 font-medium">
                  <div className="flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-full text-indigo-600 font-bold">
                    <Hash className="w-3 h-3" />
                    <span>Mã: {test.testCode || 'N/A'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{new Date(test.date).toLocaleDateString('vi-VN')}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-1 h-1 rounded-full bg-slate-300" />
                    <span>{test.questions.length} câu hỏi</span>
                  </div>
                </div>

                {/* Badges for paper-exam question types */}
                {test.questions.some(q => q.type === 'sentence_rewrite' || q.type === 'word_form' || q.type === 'fill_blank') && (
                  <div className="flex flex-wrap gap-1 mt-2.5">
                    {test.questions.some(q => q.type === 'sentence_rewrite') && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                        ✍️ Viết lại câu
                      </span>
                    )}
                    {test.questions.some(q => q.type === 'word_form') && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-100">
                        🔤 Dạng của từ
                      </span>
                    )}
                    {test.questions.some(q => q.type === 'fill_blank') && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100">
                        ✏️ Điền từ
                      </span>
                    )}
                  </div>
                )}
              </div>

              {viewMode === 'list' && (
                <div className="flex items-center gap-1 shrink-0 ml-auto">
                  {activeTab === 'public' && (
                    <span className="hidden sm:inline-block px-2 py-0.5 bg-green-50 text-green-600 text-[10px] font-bold rounded-full border border-green-100 mr-2">
                      Cộng đồng
                    </span>
                  )}
                  {activeTab === 'personal' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMovingTest(test);
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 rounded-xl transition-all font-bold text-xs"
                      title="Chuyển hộc tủ"
                    >
                      <Folder className="w-4 h-4 text-indigo-500" />
                      <span>Chuyển hộc</span>
                    </button>
                  )}
                  {(activeTab === 'personal' || test.authorUid === currentUserUid) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingTest({ id: test.id, title: test.title });
                      }}
                      className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                      title="Sửa tiêu đề"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isLoggedIn) {
                        onShare(test);
                      } else {
                        onSelect(test); // Fallback
                      }
                    }}
                    className={cn(
                      "p-2 rounded-xl transition-all",
                      isLoggedIn 
                        ? "text-slate-400 hover:text-indigo-600 hover:bg-indigo-50" 
                        : "text-slate-300 hover:text-slate-400 hover:bg-slate-50"
                    )}
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                  {test.authorUid === currentUserUid && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewResults(test);
                      }}
                      className="flex items-center gap-2 px-3 py-2 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all border border-indigo-100"
                      title="Xem báo cáo kết quả học sinh (Thống kê điểm & thời gian)"
                    >
                      <Users className="w-4 h-4" />
                      <span className="text-xs font-bold hidden sm:inline">Báo cáo</span>
                    </button>
                  )}
                  {(activeTab === 'personal' || test.authorUid === currentUserUid) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(test.id);
                      }}
                      className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                      title="Xóa đề thi này"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                  <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all ml-2">
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              )}

              {viewMode === 'grid' && (
                <div className="mt-6 flex items-center justify-between">
                  <span className="text-indigo-600 font-bold text-xs uppercase tracking-wider">Bắt đầu ngay</span>
                  <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all">
                    <ChevronRight className="w-5 h-5" />
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
      <EditTitleModal 
        isOpen={!!editingTest}
        onClose={() => setEditingTest(null)}
        onSave={(newTitle) => editingTest && onEditTitle(editingTest.id, newTitle)}
        currentTitle={editingTest?.title || ''}
      />

      {/* Add Category Modal */}
      <AnimatePresence>
        {isAddingCategory && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsAddingCategory(false)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative bg-white rounded-[2.5rem] p-8 max-w-sm w-full shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-slate-100">
              <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6">
                <FolderPlus className="w-8 h-8 text-indigo-600" />
              </div>
              <h3 className="text-xl font-black text-slate-800 mb-2 uppercase tracking-tight">Thêm hộc tủ mới</h3>
              <p className="text-slate-400 text-xs font-bold mb-6 uppercase tracking-widest">Tạo không gian lưu trữ mới</p>
              <input 
                type="text" 
                value={newCategoryName} 
                onChange={e => setNewCategoryName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddCategorySubmit()}
                className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl mb-8 focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-800"
                placeholder="Tên hộc tủ (ví dụ: Toán 12, Lý HK1...)"
                autoFocus
              />
              <div className="flex gap-3">
                <button onClick={() => setIsAddingCategory(false)} className="flex-1 py-4 rounded-2xl font-bold text-slate-500 hover:bg-slate-50 transition-all active:scale-95">Hủy</button>
                <button onClick={handleAddCategorySubmit} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 active:scale-95">Thêm ngay</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Rename Category Modal */}
      <AnimatePresence>
        {editingCategory && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setEditingCategory(null)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative bg-white rounded-[2.5rem] p-8 max-w-sm w-full shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-slate-100">
              <h3 className="text-xl font-black text-slate-800 mb-2 uppercase tracking-tight">Đổi tên hộc tủ</h3>
              <p className="text-slate-400 text-xs font-bold mb-6 uppercase tracking-widest">Sắp xếp lại kho lưu trữ của bạn</p>
              <input 
                type="text" 
                value={editingCategory.newName} 
                onChange={e => setEditingCategory({ ...editingCategory, newName: e.target.value })}
                className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl mb-8 focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-800"
                placeholder="Tên hộc tủ mới..."
                autoFocus
              />
              <div className="flex gap-3">
                <button onClick={() => setEditingCategory(null)} className="flex-1 py-4 rounded-2xl font-bold text-slate-500 hover:bg-slate-50 transition-all active:scale-95">Hủy</button>
                <button onClick={handleCategoryRename} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 active:scale-95">Lưu lại</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Merge Category Modal */}
      <AnimatePresence>
        {mergingCategory && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMergingCategory(null)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative bg-white rounded-[2.5rem] p-8 max-w-sm w-full shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-slate-100">
              <h3 className="text-xl font-black text-slate-800 mb-2 uppercase tracking-tight">Dồn hộc tủ</h3>
              <p className="text-slate-400 text-xs font-bold mb-6 uppercase tracking-widest leading-relaxed">
                Chuyển tất cả đề từ <span className="text-indigo-600">"{mergingCategory.source}"</span> vào:
              </p>
              <div className="space-y-2 mb-8 max-h-48 overflow-y-auto pr-1">
                {allCategories.filter(c => c !== mergingCategory.source).map(cat => (
                  <button 
                    key={cat}
                    onClick={() => setMergingCategory({ ...mergingCategory, target: cat })}
                    className={cn(
                      "w-full text-left px-5 py-4 rounded-2xl text-sm font-bold border-2 transition-all flex items-center justify-between",
                      mergingCategory.target === cat 
                        ? "bg-indigo-50 border-indigo-600 text-indigo-600" 
                        : "bg-white border-slate-100 text-slate-600 hover:border-slate-200"
                    )}
                  >
                    <span>{cat}</span>
                    {mergingCategory.target === cat && <CheckCircle2 className="w-4 h-4" />}
                  </button>
                ))}
                {allCategories.length <= 1 && (
                  <div className="text-center py-8">
                    <Archive className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-xs text-slate-400 font-bold italic">Không có hộc tủ khác để dồn vào</p>
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setMergingCategory(null)} className="flex-1 py-4 rounded-2xl font-bold text-slate-500 hover:bg-slate-50 transition-all active:scale-95">Thoát</button>
                <button 
                  onClick={handleCategoryMerge} 
                  disabled={!mergingCategory.target}
                  className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 disabled:opacity-50 active:scale-95"
                >
                  Xác nhận dồn
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Move Test to Category Modal */}
      <AnimatePresence>
        {movingTest && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMovingTest(null)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="relative bg-white rounded-[2.5rem] p-8 max-w-sm w-full shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-slate-100">
              <h3 className="text-xl font-black text-slate-800 mb-2 uppercase tracking-tight">Phân loại đề thi</h3>
              <p className="text-slate-400 text-xs font-bold mb-6 uppercase tracking-widest leading-relaxed">
                Chọn hộc tủ cho đề: <span className="text-indigo-600">"{movingTest.title}"</span>
              </p>
              
              <div className="space-y-2 mb-8 max-h-60 overflow-y-auto pr-1">
                <button 
                  onClick={() => {
                    onUpdateCategory(movingTest.id, '');
                    setMovingTest(null);
                  }}
                  className={cn(
                    "w-full text-left px-5 py-4 rounded-2xl text-sm font-bold border-2 transition-all flex items-center justify-between",
                    !movingTest.category ? "bg-indigo-50 border-indigo-600 text-indigo-600" : "bg-white border-slate-100 text-slate-600 hover:border-slate-200"
                  )}
                >
                  <span>Chưa phân loại</span>
                  {!movingTest.category && <CheckCircle2 className="w-4 h-4" />}
                </button>

                {allCategories.map(cat => (
                  <button 
                    key={cat}
                    onClick={() => {
                      onUpdateCategory(movingTest.id, cat);
                      setMovingTest(null);
                    }}
                    className={cn(
                      "w-full text-left px-5 py-4 rounded-2xl text-sm font-bold border-2 transition-all flex items-center justify-between",
                      movingTest.category === cat ? "bg-indigo-50 border-indigo-600 text-indigo-600" : "bg-white border-slate-100 text-slate-600 hover:border-slate-200"
                    )}
                  >
                    <span>{cat}</span>
                    {movingTest.category === cat && <CheckCircle2 className="w-4 h-4" />}
                  </button>
                ))}

                <button 
                  onClick={() => {
                    setTestToMoveAfterAdd(movingTest.id);
                    setIsAddingCategory(true);
                    setMovingTest(null);
                  }}
                  className="w-full text-left px-5 py-4 rounded-2xl text-sm font-bold border-2 border-dashed border-slate-200 text-indigo-600 hover:border-indigo-200 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tạo hộc tủ mới...</span>
                </button>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setMovingTest(null)} className="w-full py-4 rounded-2xl font-bold text-slate-500 hover:bg-slate-50 transition-all active:scale-95">Đóng</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
