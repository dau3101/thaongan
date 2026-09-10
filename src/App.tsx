import React, { useState, useEffect, useMemo } from 'react';
import { FileUpload } from './components/FileUpload';
import { TestView } from './components/TestView';
import { ResultView } from './components/ResultView';
import { PracticeView } from './components/PracticeView';
import { parseTestFiles, generatePracticeQuestions } from './services/geminiService';
import { TestData, UserAnswer, PracticeSet } from './types';
import { TestLibrary } from './components/TestLibrary';
import { SharedResultsView } from './components/SharedResultsView';
import { GlobalResultsView } from './components/GlobalResultsView';
import { Brain, Clock, User, Trash2, X, Loader2, ChevronRight, Share2, LogIn, LogOut, Users, HelpCircle, Info, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { auth, db, handleFirestoreError, OperationType, signInWithGoogle } from './firebase';
import { signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, setDoc, getDoc, collection } from 'firebase/firestore';

type AppState = 'library' | 'upload' | 'testing' | 'result' | 'practice' | 'history' | 'shared_results' | 'global_results';

interface TestHistory {
  id: string;
  title: string;
  score: number;
  date: string;
  testData: TestData;
  answers: UserAnswer[];
}

const getInitialOngoingTest = () => {
  try {
    const saved = localStorage.getItem('ai_test_master_ongoing');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.testData && Array.isArray(parsed.testData.questions) && parsed.testData.questions.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error reading initial ongoing test:', e);
  }
  return null;
};

export default function App() {
  const initialOngoing = React.useMemo(() => getInitialOngoingTest(), []);
  // If the user was in the middle of a test and did NOT explicitly pause, auto-resume directly
  const shouldAutoResume = Boolean(
    initialOngoing && 
    initialOngoing.status !== 'paused' && 
    typeof window !== 'undefined' && 
    !window.location.search.includes('testId')
  );

  const [state, setState] = useState<AppState>(() => shouldAutoResume ? 'testing' : 'library');
  const [testData, setTestData] = useState<TestData | null>(() => shouldAutoResume ? initialOngoing.testData : null);
  const [userAnswers, setUserAnswers] = useState<UserAnswer[]>(() => shouldAutoResume ? (initialOngoing.userAnswers || []) : []);
  const [practiceSets, setPracticeSets] = useState<PracticeSet[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isGeneratingPractice, setIsGeneratingPractice] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [userName, setUserName] = useState<string>(() => localStorage.getItem('ai_test_master_user') || '');
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isSharedMode, setIsSharedMode] = useState<boolean>(() => shouldAutoResume ? Boolean(initialOngoing.isSharedMode) : false);
  const [sharedResultsTest, setSharedResultsTest] = useState<TestData | null>(null);
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [currentTestIndex, setCurrentTestIndex] = useState<number>(() => shouldAutoResume ? (initialOngoing.currentTestIndex || 0) : 0);
  const [testStartTime, setTestStartTime] = useState<number | undefined>(() => shouldAutoResume ? initialOngoing.testStartTime : undefined);
  const [ongoingTest, setOngoingTest] = useState<any>(() => shouldAutoResume ? null : initialOngoing);
  
  const [history, setHistory] = useState<TestHistory[]>(() => {
    const saved = localStorage.getItem('ai_test_master_history');
    return saved ? JSON.parse(saved) : [];
  });
  const [library, setLibrary] = useState<TestData[]>(() => {
    const saved = localStorage.getItem('ai_test_master_library');
    return saved ? JSON.parse(saved) : [];
  });
  const [publicTests, setPublicTests] = useState<TestData[]>([]);
  const [emptyCategories, setEmptyCategories] = useState<string[]>(() => {
    const saved = localStorage.getItem('ai_test_master_empty_categories');
    return saved ? JSON.parse(saved) : [];
  });

  // Safe progress saver to prevent localStorage quota issues and guarantee immediate persistence
  const saveProgressSafely = (
    answersToSave: UserAnswer[],
    indexToSave?: number,
    dataToSave?: TestData,
    status: 'in_progress' | 'paused' = 'in_progress'
  ) => {
    const currentData = dataToSave || testData;
    if (!currentData || isReviewMode) return;

    const targetIndex = indexToSave !== undefined ? indexToSave : currentTestIndex;
    const startTime = testStartTime || Date.now();

    try {
      // Always strip heavy base64 audio before saving to localStorage to prevent QuotaExceededError
      const testDataToSave = {
        ...currentData,
        audioData: undefined
      };
      const ongoing = {
        testData: testDataToSave,
        userAnswers: answersToSave,
        currentTestIndex: targetIndex,
        testStartTime: startTime,
        isSharedMode,
        userName,
        status,
        timestamp: Date.now()
      };
      localStorage.setItem('ai_test_master_ongoing', JSON.stringify(ongoing));

      if (currentData.id) {
        localStorage.setItem(`ai_test_progress_${currentData.id}`, JSON.stringify({
          userAnswers: answersToSave,
          currentTestIndex: targetIndex,
          testStartTime: startTime,
          timestamp: Date.now()
        }));
      }
    } catch (err: any) {
      console.warn('LocalStorage quota warning, falling back to minimal payload:', err);
      try {
        const minimalQuestions = currentData.questions.map(q => ({
          id: q.id,
          text: q.text,
          options: q.options,
          correctAnswer: q.correctAnswer,
          points: q.points,
          penaltyPoints: q.penaltyPoints
        }));
        const minimalOngoing = {
          testData: {
            id: currentData.id,
            title: currentData.title,
            questions: minimalQuestions
          },
          userAnswers: answersToSave,
          currentTestIndex: targetIndex,
          testStartTime: startTime,
          isSharedMode,
          userName,
          status,
          timestamp: Date.now()
        };
        localStorage.setItem('ai_test_master_ongoing', JSON.stringify(minimalOngoing));
      } catch (e2) {
        console.error('Failed to save ongoing test to localStorage:', e2);
      }
    }
  };

  // Debounced localStorage sync to improve performance
  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem('ai_test_master_history', JSON.stringify(history));
    }, 1000);
    return () => clearTimeout(timer);
  }, [history]);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem('ai_test_master_library', JSON.stringify(library));
      } catch (err: any) {
        if (err.name === 'QuotaExceededError' || err.code === 22) {
          // If we exceed quota (e.g. because of large base64 audio), strip audioData and try again
          try {
            const libraryWithoutAudio = library.map(test => ({
              ...test,
              audioData: undefined
            }));
            localStorage.setItem('ai_test_master_library', JSON.stringify(libraryWithoutAudio));
            console.warn('Lưu trữ cục bộ đầy, đã loại bỏ file âm thanh để có thể lưu đề thi.');
          } catch (e) {
            console.error('Save to local storage failed even after stripping audio:', e);
          }
        }
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [library]);

  useEffect(() => {
    localStorage.setItem('ai_test_master_empty_categories', JSON.stringify(emptyCategories));
  }, [emptyCategories]);

  useEffect(() => {
    localStorage.setItem('ai_test_master_user', userName);
  }, [userName]);

  // If audioData was stripped when saving to avoid quota limits, restore from library
  useEffect(() => {
    if (testData && (!testData.audioData || testData.audioData.length === 0) && library.length > 0) {
      const match = library.find(t => t.id === testData.id);
      if (match?.audioData && match.audioData.length > 0) {
        setTestData(prev => prev ? { ...prev, audioData: match.audioData } : prev);
      }
    }
  }, [testData?.id, library]);

  // Keepalive interval during testing to keep session timestamp updated
  useEffect(() => {
    if (state !== 'testing' || !testData || isReviewMode) return;

    const interval = setInterval(() => {
      try {
        const saved = localStorage.getItem('ai_test_master_ongoing');
        if (saved) {
          const parsed = JSON.parse(saved);
          parsed.timestamp = Date.now();
          parsed.status = 'in_progress';
          localStorage.setItem('ai_test_master_ongoing', JSON.stringify(parsed));
        }
      } catch (e) {
        // ignore
      }
    }, 25000);

    return () => clearInterval(interval);
  }, [state, testData, isReviewMode]);

  // Persist current test state with debounce as a safety net
  useEffect(() => {
    if (state === 'testing' && testData && !isReviewMode) {
      const timer = setTimeout(() => {
        saveProgressSafely(userAnswers, currentTestIndex, testData, 'in_progress');
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [state, testData, userAnswers, currentTestIndex, testStartTime, isSharedMode, isReviewMode, userName]);

  // Check for ongoing test on load if not already auto-resumed
  useEffect(() => {
    if (state === 'testing') return;
    const savedOngoing = localStorage.getItem('ai_test_master_ongoing');
    if (savedOngoing) {
      try {
        const ongoing = JSON.parse(savedOngoing);
        setOngoingTest(ongoing);
      } catch (e) {
        console.error('Error parsing ongoing test:', e);
      }
    }
  }, [state]);

  const resumeOngoingTest = () => {
    const targetOngoing = ongoingTest || getInitialOngoingTest();
    if (targetOngoing && targetOngoing.testData) {
      let restoredData = targetOngoing.testData;
      if (!restoredData.audioData || restoredData.audioData.length === 0) {
        const match = library.find(t => t.id === restoredData.id);
        if (match?.audioData && match.audioData.length > 0) {
          restoredData = { ...restoredData, audioData: match.audioData };
        }
      }
      setTestData(restoredData);
      setUserAnswers(targetOngoing.userAnswers || []);
      setCurrentTestIndex(targetOngoing.currentTestIndex || 0);
      setTestStartTime(targetOngoing.testStartTime || Date.now());
      setIsSharedMode(Boolean(targetOngoing.isSharedMode));
      if (targetOngoing.userName) setUserName(targetOngoing.userName);
      setIsReviewMode(false);
      saveProgressSafely(targetOngoing.userAnswers || [], targetOngoing.currentTestIndex || 0, restoredData, 'in_progress');
      setState('testing');
      setOngoingTest(null);
    }
  };

  const clearOngoingTest = () => {
    showConfirm(
      'Hủy bài làm dở dang?',
      'Bạn có chắc chắn muốn hủy bài làm này? Toàn bộ tiến độ và câu trả lời đã lưu sẽ bị xóa.',
      () => {
        if (ongoingTest?.testData?.id) {
          localStorage.removeItem(`ai_test_progress_${ongoingTest.testData.id}`);
        }
        localStorage.removeItem('ai_test_master_ongoing');
        setOngoingTest(null);
      },
      undefined,
      'Xóa bài làm',
      'Giữ lại'
    );
  };

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (state === 'testing' && !isReviewMode) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [state, isReviewMode]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (user) {
        setLibrary(prev => prev.map(test => {
          const updates: any = {};
          if (!test.authorUid) updates.authorUid = user.uid;
          return Object.keys(updates).length > 0 ? { ...test, ...updates } : test;
        }));
      }
    });
    return () => unsubscribe();
  }, []);

  // Backfill testCode for local library if missing
  useEffect(() => {
    setLibrary(prev => prev.map(test => {
      if (!test.testCode) {
        return { ...test, testCode: Math.floor(1000 + Math.random() * 9000).toString() };
      }
      return test;
    }));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedTestId = params.get('testId');
    console.log('Checking for shared test ID:', sharedTestId);
    
    if (sharedTestId) {
      loadSharedTest(sharedTestId);
    }
    
    // Fetch public tests
    fetchPublicTests();
  }, []);

  const fetchPublicTests = async () => {
    try {
      console.log('Fetching public tests from Firestore...');
      const { getDocs, query, limit, orderBy } = await import('firebase/firestore');
      const q = query(collection(db, 'shared_tests'), orderBy('date', 'desc'), limit(20));
      const querySnapshot = await getDocs(q);
      const tests: TestData[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data() as TestData;
        // Backfill testCode for public tests if missing
        if (!data.testCode) {
          data.testCode = Math.floor(1000 + Math.random() * 9000).toString();
        }
        tests.push(data);
      });
      console.log(`Fetched ${tests.length} public tests.`);
      setPublicTests(tests);
    } catch (error) {
      console.error('Error fetching public tests:', error);
    }
  };

  const loadSharedTest = async (id: string) => {
    console.log('Loading shared test:', id);
    
    // FIRST: Check if we have an ongoing session for THIS specific test ID
    const savedOngoing = localStorage.getItem('ai_test_master_ongoing');
    if (savedOngoing) {
      try {
        const ongoing = JSON.parse(savedOngoing);
        if (ongoing.testData && ongoing.testData.id === id) {
          console.log('Found ongoing session for this shared test, resuming...');
          setTestData(ongoing.testData);
          setUserAnswers(ongoing.userAnswers || []);
          setCurrentTestIndex(ongoing.currentTestIndex || 0);
          setTestStartTime(ongoing.testStartTime);
          setIsSharedMode(true);
          if (ongoing.userName) setUserName(ongoing.userName);
          setIsReviewMode(false);
          setState('testing');
          return;
        }
      } catch (e) {
        console.error('Error checking ongoing session during load:', e);
      }
    }

    // SECOND: Check if we have saved per-test progress for THIS test ID
    const savedLocalProgress = localStorage.getItem(`ai_test_progress_${id}`);
    if (savedLocalProgress) {
      try {
        const prog = JSON.parse(savedLocalProgress);
        if (prog && Array.isArray(prog.userAnswers) && prog.userAnswers.length > 0) {
          const testDoc = await getDoc(doc(db, 'shared_tests', id));
          if (testDoc.exists()) {
            const data = testDoc.data() as TestData;
            if (!data.testCode) {
              data.testCode = Math.floor(1000 + Math.random() * 9000).toString();
            }
            setTestData(data);
            setUserAnswers(prog.userAnswers);
            setCurrentTestIndex(prog.currentTestIndex || 0);
            setTestStartTime(prog.testStartTime || Date.now());
            setIsSharedMode(true);
            saveProgressSafely(prog.userAnswers, prog.currentTestIndex || 0, data, 'in_progress');
            setState('testing');
            return;
          }
        }
      } catch (e) {
        console.error('Error checking per-test progress during load:', e);
      }
    }

    setIsLoading(true);
    try {
      const testDoc = await getDoc(doc(db, 'shared_tests', id));
      if (testDoc.exists()) {
        const data = testDoc.data() as TestData;
        if (!data.testCode) {
          data.testCode = Math.floor(1000 + Math.random() * 9000).toString();
        }
        setTestData(data);
        setUserAnswers([]);
        setIsSharedMode(true);
        setState('testing');
      } else {
        showMessage('Không tìm thấy', 'Không tìm thấy đề thi này hoặc đề thi đã bị xóa. Vui lòng kiểm tra lại link chia sẻ.', 'error');
        window.history.replaceState({}, '', window.location.pathname);
      }
    } catch (error) {
      console.error('Error loading shared test:', error);
      showMessage('Lỗi tải đề', 'Lỗi khi tải đề thi: ' + (error instanceof Error ? error.message : 'Lỗi không xác định'), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditTestTitle = async (id: string, newTitle: string) => {
    // Update local library
    setLibrary(prev => prev.map(test => 
      test.id === id ? { ...test, title: newTitle } : test
    ));

    // Update public tests locally
    setPublicTests(prev => prev.map(test => 
      test.id === id ? { ...test, title: newTitle } : test
    ));

    // Update history if it contains this test
    setHistory(prev => prev.map(item => 
      item.testData.id === id ? { ...item, title: newTitle, testData: { ...item.testData, title: newTitle } } : item
    ));

    // If user is logged in, try to update in Firestore if it was shared
    if (user) {
      try {
        const testRef = doc(db, 'shared_tests', id);
        const testSnap = await getDoc(testRef);
        if (testSnap.exists() && testSnap.data().authorUid === user.uid) {
          await setDoc(testRef, { title: newTitle }, { merge: true });
          // Refresh public tests to ensure sync
          fetchPublicTests();
        }
      } catch (error) {
        console.error('Error updating title in Firestore:', error);
      }
    }
  };

  const handleLogin = async () => {
    if (isLoggingIn) return;
    
    setIsLoggingIn(true);
    try {
      await signInWithGoogle();
    } catch (error: any) {
      console.error('Login error:', error);
      const errorCode = error.code;
      
      switch (errorCode) {
        case 'auth/cancelled-popup-request':
          // This happens when multiple popups are requested, we can ignore it as one is already handled
          console.warn('Popup request was cancelled because another one was pending.');
          break;
        case 'auth/popup-blocked':
          alert('Trình duyệt đã chặn cửa sổ đăng nhập. Vui lòng cho phép hiện cửa sổ bật lên (pop-up) cho trang web này và thử lại.');
          break;
        case 'auth/popup-closed-by-user':
          alert('Cửa sổ đăng nhập đã bị đóng trước khi hoàn tất. Vui lòng thử lại.');
          break;
        case 'auth/cancelled-popup-request':
          alert('Yêu cầu đăng nhập đã bị hủy. Có thể có một cửa sổ đăng nhập khác đang mở.');
          break;
        case 'auth/unauthorized-domain':
          alert('Tên miền này chưa được ủy quyền trong Firebase Console. Vui lòng thêm tên miền của ứng dụng vào danh sách "Authorized Domains" trong phần Authentication của Firebase.');
          break;
        case 'auth/internal-error':
          alert('Lỗi hệ thống Firebase. Vui lòng kiểm tra lại kết nối mạng hoặc thử lại sau.');
          break;
        case 'auth/network-request-failed':
          alert('Lỗi kết nối mạng. Vui lòng kiểm tra lại internet của bạn.');
          break;
        default:
          alert(`Lỗi đăng nhập (${errorCode}): ${error.message || 'Không xác định'}`);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    showConfirm(
      'Đăng xuất?',
      'Bạn có thực sự muốn đăng xuất không?',
      async () => {
        try {
          await signOut(auth);
        } catch (error) {
          console.error('Logout error:', error);
        }
      }
    );
  };

  const handleShareTest = async (test: TestData) => {
    if (!user) {
      showConfirm(
        'Đăng nhập để chia sẻ',
        'Vui lòng đăng nhập để có thể chia sẻ đề thi này và xem báo cáo kết quả của học sinh.',
        handleLogin
      );
      return;
    }

    setIsLoading(true);
    try {
      const sharedTestData = {
        ...test,
        authorUid: user.uid,
        isPublic: true
      };
      
      console.log('Saving test to Firestore:', test.id);
      await setDoc(doc(db, 'shared_tests', test.id), sharedTestData);
      
      let origin = window.location.origin;
      if (origin.includes('-dev-')) {
        origin = origin.replace('-dev-', '-pre-');
      }

      const shareUrl = `${origin}${window.location.pathname}?testId=${test.id}`;
      
      try {
        await navigator.clipboard.writeText(shareUrl);
        showConfirm(
          'Chia sẻ thành công',
          `Link bài tập đã được sao chép vào bộ nhớ tạm: ${shareUrl}\n\nHãy gửi link này cho học sinh của bạn.`,
          () => {}
        );
      } catch (clipboardError) {
        showConfirm(
          'Chia sẻ thành công',
          `Link bài tập của bạn là: ${shareUrl}\n\n(Vui lòng sao chép thủ công)`,
          () => {}
        );
      }

      fetchPublicTests();
    } catch (error: any) {
      console.error('Error sharing test:', error);
      let errMsg = 'Có lỗi xảy ra khi chia sẻ đề thi. Vui lòng thử lại sau.';
      if (error && error.code === 'resource-exhausted' || error.message?.includes('Maximum document size')) {
        errMsg = 'Kích thước đề thi quá lớn (vượt quá 1MB giới hạn của hệ thống). Điều này thường xảy ra do file Âm thanh đính kèm. Vui lòng nén file âm thanh nhỏ hơn để có thể chia sẻ.';
      }
      showConfirm(
        'Lỗi chia sẻ',
        errMsg,
        () => {}
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (
    files: {name: string, data: string, mimeType: string, isBase64: boolean}[],
    options?: { excludeAudio?: boolean }
  ) => {
    setIsParsing(true);
    setUploadError(null);
    try {
      const isExcludeAudio = options?.excludeAudio ?? false;
      const docFiles = files.filter(f => !f.mimeType.startsWith('audio/'));
      const audioFiles = isExcludeAudio ? [] : files.filter(f => f.mimeType.startsWith('audio/'));

      if (docFiles.length === 0) {
        throw new Error('Vui lòng tải lên ít nhất 1 file tài liệu đề thi (PDF, DOCX, Ảnh, Text).');
      }

      const result = await parseTestFiles(docFiles, { excludeAudio: isExcludeAudio });
      
      const audioData = !isExcludeAudio 
        ? audioFiles.map(f => `data:${f.mimeType};base64,${f.data}`)
        : [];

      const newTest: TestData = {
        ...result,
        authorUid: user?.uid,
        excludeAudio: isExcludeAudio,
        ...(audioData.length > 0 && { audioData })
      };
      
      setLibrary(prev => [newTest, ...prev]);
      handleSelectTest(newTest);
      setState('testing');
    } catch (error: any) {
      console.error('File upload error:', error);
      let errorMessage = error.message || 'Lỗi khi phân tích file. Vui lòng thử lại với file PDF hoặc hình ảnh rõ nét hơn.';
      
      if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('RESOURCE_EXHAUSTED') || errorMessage.includes('rate-limits')) {
        errorMessage = 'Hạn ngạch AI (Quota 429) hiện tại đã hết hoặc mô hình Pro yêu cầu cấu hình dự án trả phí (Paid Project). Vui lòng cấu hình Paid Project trong Google AI Studio hoặc chờ ít phút rồi thử lại.';
      }
      
      setUploadError(errorMessage);
    } finally {
      setIsParsing(false);
    }
  };

  const handleTestFinish = async (answers: UserAnswer[], timeTaken: number) => {
    setUserAnswers(answers);
    localStorage.removeItem('ai_test_master_ongoing');
    setOngoingTest(null);
    
    if (testData) {
      // Calculate detailed points based on barem
      let correctPointsSum = 0;
      let penaltyPointsSum = 0;
      testData.questions.forEach((q, idx) => {
        const qId = q.id || `q-${idx}`;
        const qPoints = typeof q.points === 'number' ? q.points : (10 / testData.questions.length);
        const qPenalty = typeof q.penaltyPoints === 'number' ? q.penaltyPoints : 0;
        
        const ans = answers.find(a => a.questionId === qId);
        if (ans) {
          if (ans.isCorrect) {
            correctPointsSum += qPoints;
          } else {
            penaltyPointsSum += qPenalty;
          }
        }
      });

      const rawScore = correctPointsSum - penaltyPointsSum;
      const score = Math.max(0, Math.round(rawScore * 100) / 100);
      
      const newHistoryItem: TestHistory = {
        id: crypto.randomUUID(),
        title: testData.title,
        score,
        date: new Date().toISOString(),
        testData,
        answers
      };
      
      setHistory(prev => [newHistoryItem, ...prev].slice(0, 50)); // Keep last 50

      // Save result to Firestore if shared
      if (isSharedMode && testData.id) {
        try {
          const resultId = crypto.randomUUID();
          await setDoc(doc(db, 'test_results', resultId), {
            id: resultId,
            testId: testData.id,
            testTitle: testData.title,
            teacherUid: testData.authorUid || null,
            studentName: userName || 'Ẩn danh',
            score,
            timeTaken,
            date: new Date().toISOString(),
            answers
          });
        } catch (error) {
          console.error('Error saving result:', error);
        }
      }
    }
    
    setState('result');
  };

  const handleStartPractice = async () => {
    if (!testData || userAnswers.length === 0) return;
    
    setIsGeneratingPractice(true);
    try {
      const failedTopics = Array.from(new Set(
        userAnswers.filter(a => !a.isCorrect).map(a => {
          const q = testData.questions.find((_, i) => i.toString() === a.questionId || (testData.questions[i].id === a.questionId));
          return q?.topic || 'Chung';
        })
      ));

      if (failedTopics.length > 0) {
        const sets = await generatePracticeQuestions(failedTopics);
        setPracticeSets(sets);
        setState('practice');
      }
    } catch (error) {
      console.error('Error generating practice:', error);
      alert('Không thể tạo bài tập ôn tập. Vui lòng thử lại.');
    } finally {
      setIsGeneratingPractice(false);
    }
  };

  const [confirmConfig, setConfirmConfig] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel?: () => void;
    confirmText?: string;
    cancelText?: string;
  }>({
    show: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const showConfirm = (
    title: string,
    message: string,
    onConfirm: () => void,
    onCancel?: () => void,
    confirmText?: string,
    cancelText?: string
  ) => {
    setConfirmConfig({ show: true, title, message, onConfirm, onCancel, confirmText, cancelText });
  };

  const [statusMessage, setStatusMessage] = useState<{
    show: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'info';
  }>({
    show: false,
    title: '',
    message: '',
    type: 'info'
  });

  const showMessage = (title: string, message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setStatusMessage({ show: true, title, message, type });
  };

  const handleRestart = () => {
    const doRestart = () => {
      // Save current progress before resetting view
      if (testData && userAnswers.length > 0) {
        saveProgressSafely(userAnswers, currentTestIndex, testData, 'paused');
        setOngoingTest({
          testData: { ...testData, audioData: undefined },
          userAnswers,
          currentTestIndex,
          testStartTime: testStartTime || Date.now(),
          isSharedMode,
          userName,
          status: 'paused',
          timestamp: Date.now()
        });
      }
      setTestData(null);
      setUserAnswers([]);
      setPracticeSets([]);
      setIsSharedMode(false);
      setIsReviewMode(false);
      setCurrentTestIndex(0);
      try {
        if (window.location.search) {
          window.history.replaceState({}, '', window.location.pathname);
        }
      } catch (e) {
        console.warn('Could not update URL history:', e);
      }
      setState('library');
    };

    if (state === 'testing' && !isReviewMode) {
      showConfirm(
        'Tạm dừng bài thi?',
        `Bạn đang làm bài thi (đã hoàn thành ${userAnswers.length}/${testData?.questions.length || 0} câu). Bạn có muốn tạm dừng và quay lại thư viện không? Tiến độ hiện tại đã được lưu an toàn để bạn tiếp tục bất cứ lúc nào.`,
        doRestart,
        undefined,
        'Tạm dừng & Về thư viện',
        'Tiếp tục làm bài'
      );
    } else {
      doRestart();
    }
  };

  const handleDeleteTest = (id: string) => {
    showConfirm(
      'Xóa đề thi?',
      'Bạn có chắc chắn muốn xóa đề thi này không? Nếu đề này đã được chia sẻ, học sinh sẽ không thể truy cập được nữa.',
      async () => {
        const testToDelete = library.find(t => t.id === id);
        const categoryCheck = testToDelete?.category;
        
        setLibrary(prev => prev.filter(t => t.id !== id));

        if (categoryCheck) {
          const otherInCat = library.filter(t => t.id !== id && t.category === categoryCheck);
          if (otherInCat.length === 0) {
            setEmptyCategories(prev => [...new Set([...prev, categoryCheck])]);
          }
        }
        
        if (user) {
          try {
            const { deleteDoc } = await import('firebase/firestore');
            const testRef = doc(db, 'shared_tests', id);
            await deleteDoc(testRef);
            fetchPublicTests();
          } catch (error) {
            console.error('Error deleting test from Firestore:', error);
          }
        }
      }
    );
  };

  const handleSelectTest = (test: TestData) => {
    // Check if there is saved ongoing progress for this specific test
    let savedAnswers: UserAnswer[] = [];
    let savedIndex = 0;
    let savedStartTime = Date.now();

    try {
      const raw = localStorage.getItem(`ai_test_progress_${test.id}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.userAnswers) && parsed.userAnswers.length > 0) {
          savedAnswers = parsed.userAnswers;
          savedIndex = parsed.currentTestIndex || 0;
          savedStartTime = parsed.testStartTime || Date.now();
        }
      }
    } catch (e) {}

    if (savedAnswers.length === 0 && ongoingTest?.testData?.id === test.id) {
      savedAnswers = ongoingTest.userAnswers || [];
      savedIndex = ongoingTest.currentTestIndex || 0;
      savedStartTime = ongoingTest.testStartTime || Date.now();
    }

    if (savedAnswers.length > 0) {
      showConfirm(
        'Tiếp tục làm bài?',
        `Bạn đang có bài làm dở dang cho bộ đề "${test.title}" (đã trả lời ${savedAnswers.length}/${test.questions.length} câu). Bạn có muốn tiếp tục làm bài không?`,
        () => {
          // Resume
          setTestData(test);
          setUserAnswers(savedAnswers);
          setCurrentTestIndex(savedIndex);
          setTestStartTime(savedStartTime);
          setIsReviewMode(false);
          setOngoingTest(null);
          saveProgressSafely(savedAnswers, savedIndex, test, 'in_progress');
          setState('testing');
        },
        () => {
          // Restart from scratch
          localStorage.removeItem(`ai_test_progress_${test.id}`);
          if (ongoingTest?.testData?.id === test.id) {
            localStorage.removeItem('ai_test_master_ongoing');
            setOngoingTest(null);
          }
          setTestData(test);
          setUserAnswers([]);
          setTestStartTime(Date.now());
          setIsReviewMode(false);
          setCurrentTestIndex(0);
          saveProgressSafely([], 0, test, 'in_progress');
          setState('testing');
        },
        'Tiếp tục làm tiếp',
        'Làm lại từ đầu'
      );
    } else {
      setTestData(test);
      setUserAnswers([]);
      setTestStartTime(Date.now());
      setIsReviewMode(false);
      setCurrentTestIndex(0);
      saveProgressSafely([], 0, test, 'in_progress');
      setState('testing');
    }
  };

  const handleViewResults = (test: TestData) => {
    setSharedResultsTest(test);
    setState('shared_results');
  };

  const handleUpdateCategory = async (id: string, category: string) => {
    const oldCategory = library.find(t => t.id === id)?.category;
    
    setLibrary(prev => prev.map(test => 
      test.id === id ? { ...test, category } : test
    ));

    // If moving to a category that was in "emptyCategories", remove it from there
    if (category) {
      setEmptyCategories(prev => prev.filter(c => c !== category));
    }

    // If the OLD category is now empty in the library, move it to emptyCategories so it stays visible
    if (oldCategory) {
      // We check if there are OTHER tests in that old category
      // Note: library state hasn't updated yet in this function's scope, so we check carefully
      const otherTestsInOldCat = library.filter(t => t.id !== id && t.category === oldCategory);
      if (otherTestsInOldCat.length === 0) {
        setEmptyCategories(prev => [...new Set([...prev, oldCategory])]);
      }
    }

    if (user) {
      try {
        const testRef = doc(db, 'shared_tests', id);
        const testSnap = await getDoc(testRef);
        if (testSnap.exists() && testSnap.data().authorUid === user.uid) {
          await setDoc(testRef, { category }, { merge: true });
        }
      } catch (error) {
        console.error('Error updating category in Firestore:', error);
      }
    }
  };

  const handleRenameCategory = async (oldName: string, newName: string) => {
    setLibrary(prev => prev.map(test => 
      test.category === oldName ? { ...test, category: newName } : test
    ));
    
    setEmptyCategories(prev => prev.map(c => c === oldName ? newName : c));

    if (user) {
      try {
        // This is a bit more complex in Firestore if we have many tests
        // For simplicity, we'll iterate locally and update what we can
        const mySharedTests = library.filter(t => t.category === oldName && (t.authorUid === user.uid || !t.authorUid));
        for (const test of mySharedTests) {
          await setDoc(doc(db, 'shared_tests', test.id), { category: newName }, { merge: true });
        }
      } catch (error) {
        console.error('Error renaming category in Firestore:', error);
      }
    }
  };

  const handleMergeCategories = async (source: string, target: string) => {
    setLibrary(prev => prev.map(test => 
      test.category === source ? { ...test, category: target } : test
    ));

    setEmptyCategories(prev => prev.filter(c => c !== source));

    if (user) {
      try {
        const mySharedTests = library.filter(t => t.category === source && (t.authorUid === user.uid || !t.authorUid));
        for (const test of mySharedTests) {
          await setDoc(doc(db, 'shared_tests', test.id), { category: target }, { merge: true });
        }
      } catch (error) {
        console.error('Error merging categories in Firestore:', error);
      }
    }
  };

  const handleAddCategory = (name: string) => {
    if (!name || name.trim() === '') return;
    const trimmedName = name.trim();
    // Only add if it doesn't exist in library categories AND not in emptyCategories
    const existsInLibrary = library.some(t => t.category === trimmedName);
    const existsInEmpty = emptyCategories.includes(trimmedName);
    
    if (!existsInLibrary && !existsInEmpty) {
      setEmptyCategories(prev => [...prev, trimmedName]);
    }
  };

  const handleDeleteCategory = (name: string) => {
    // Only allow deleting if it's empty (not used by any tests)
    const isInUse = library.some(t => t.category === name);
    if (!isInUse) {
      setEmptyCategories(prev => prev.filter(c => c !== name));
    }
  };

  const handleRedo = () => {
    setUserAnswers([]);
    setTestStartTime(Date.now());
    setIsReviewMode(false);
    setState('testing');
  };

  const handleReview = () => {
    setIsReviewMode(true);
    setState('testing');
  };

  const loadFromHistory = (item: TestHistory) => {
    setTestData(item.testData);
    setUserAnswers(item.answers);
    setIsReviewMode(false);
    setState('result');
  };

  const deleteHistory = (id: string) => {
    showConfirm(
      'Xóa lịch sử?',
      'Bạn có thực sự muốn xóa lịch sử làm bài này không?',
      () => setHistory(prev => prev.filter(h => h.id !== id))
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 py-4 px-6 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={handleRestart}>
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
              <Brain className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-800 tracking-tight">AI TEST MASTER</h1>
              <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Học tập thông minh hơn</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 md:gap-4">
            {user ? (
              <div className="flex items-center gap-2">
                <img src={user.photoURL || ''} alt={user.displayName || ''} className="w-8 h-8 rounded-full border border-slate-200" />
                <button onClick={handleLogout} className="text-xs font-bold text-slate-500 hover:text-red-500 transition-colors">Đăng xuất</button>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                disabled={isLoggingIn}
                className={cn(
                  "flex items-center gap-2 bg-white border border-slate-200 px-3 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all",
                  isLoggingIn && "opacity-50 cursor-not-allowed"
                )}
              >
                {isLoggingIn ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LogIn className="w-4 h-4" />
                )}
                <span className="hidden md:inline">{isLoggingIn ? 'Đang xử lý...' : 'Đăng nhập'}</span>
              </button>
            )}

            <div className="h-6 w-px bg-slate-200 mx-1" />

            <button 
              onClick={() => {
                if (state === 'testing' && !isReviewMode) {
                  showConfirm(
                    'Tạm dừng bài thi?',
                    'Bạn đang làm bài thi. Bạn có muốn tạm dừng để xem lịch sử làm bài không? Tiến độ hiện tại của bạn sẽ được lưu an toàn.',
                    () => {
                      if (testData && userAnswers.length > 0) {
                        saveProgressSafely(userAnswers, currentTestIndex, testData, 'paused');
                      }
                      setState('history');
                    },
                    undefined,
                    'Xem lịch sử',
                    'Tiếp tục làm bài'
                  );
                } else {
                  setState('history');
                }
              }}
              className={cn(
                "p-2 rounded-xl transition-all",
                state === 'history' ? "bg-indigo-50 text-indigo-600" : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              )}
              title="Lịch sử làm bài"
            >
              <Clock className="w-6 h-6" />
            </button>

            <div className="h-8 w-px bg-slate-200 hidden md:block" />

            <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-2xl border border-slate-100">
              <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-indigo-600 shadow-sm">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                placeholder="Tên của bạn..."
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="bg-transparent border-none focus:ring-0 text-sm font-bold text-slate-700 w-24 md:w-32 placeholder:text-slate-300"
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center py-12 px-4 overflow-y-auto">
        <AnimatePresence mode="wait">
          {state === 'library' && (
            <motion.div
              key="library"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-7xl mx-auto space-y-8"
            >
              {ongoingTest && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-indigo-600 rounded-3xl p-6 text-white shadow-xl shadow-indigo-200 flex flex-col md:flex-row items-center justify-between gap-6"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                      <Clock className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black">BẠN ĐANG CÓ BÀI LÀM DỞ DANG</h3>
                      <p className="text-indigo-100 text-sm font-medium">
                        Bộ đề: <span className="font-bold text-white">{ongoingTest.testData.title}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 w-full md:w-auto">
                    <button 
                      onClick={resumeOngoingTest}
                      className="flex-1 md:flex-none bg-white text-indigo-600 hover:bg-indigo-50 px-6 py-3 rounded-xl font-black transition-all flex items-center justify-center gap-2"
                    >
                      Tiếp tục làm bài <ChevronRight className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={clearOngoingTest}
                      className="p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-all text-white"
                      title="Hủy bài làm này"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </motion.div>
              )}

              <TestLibrary 
                tests={library} 
                publicTests={publicTests}
                emptyCategories={emptyCategories}
                onSelect={handleSelectTest} 
                onDelete={handleDeleteTest}
                onEditTitle={handleEditTestTitle}
                onUpdateCategory={handleUpdateCategory}
                onAddCategory={handleAddCategory}
                onDeleteCategory={handleDeleteCategory}
                onRenameCategory={handleRenameCategory}
                onMergeCategories={handleMergeCategories}
                onUploadNew={() => setState('upload')}
                onShare={handleShareTest}
                onViewResults={handleViewResults}
                onViewGlobalResults={() => setState('global_results')}
                isLoggedIn={!!user}
                currentUserUid={user?.uid}
              />
            </motion.div>
          )}

          {state === 'upload' && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full"
            >
              <div className="max-w-4xl mx-auto mb-8">
                <button 
                  onClick={() => setState('library')}
                  className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-bold transition-colors"
                >
                  <ChevronRight className="w-5 h-5 rotate-180" />
                  <span>Quay lại thư viện</span>
                </button>
              </div>
              <div className="text-center mb-12">
                <h2 className="text-4xl font-black text-slate-800 mb-4 leading-tight">
                  Biến tài liệu của bạn thành <br />
                  <span className="text-indigo-600">Bài kiểm tra tương tác</span>
                </h2>
                <p className="text-slate-500 max-w-lg mx-auto">
                  Tải lên file PDF hoặc Word, AI sẽ tự động tạo bài thi với hỗ trợ LaTeX và gạch chân chuẩn xác cho tiếng Anh.
                </p>
              </div>
              <FileUpload onFileSelect={handleFileUpload} isLoading={isParsing} />
              
              {uploadError && (
                <div className="max-w-md mx-auto mt-6 p-4 bg-red-50 text-red-700 rounded-2xl text-sm border border-red-200">
                  <div className="font-bold flex items-center gap-2 mb-1">
                    <span>⚠️</span>
                    <span>Thông báo:</span>
                  </div>
                  <div className="text-xs text-red-600 leading-relaxed">
                    {uploadError}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {state === 'testing' && testData && (
            <motion.div
              key="testing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full"
            >
              {isSharedMode && !userName ? (
                <div className="max-w-md mx-auto bg-white rounded-3xl border border-slate-200 p-8 shadow-xl">
                  <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <User className="w-8 h-8 text-indigo-600" />
                    </div>
                    <h2 className="text-2xl font-black text-slate-800 mb-2">Chào mừng bạn!</h2>
                    <p className="text-slate-500 font-medium">Vui lòng nhập tên của bạn để bắt đầu bài thi.</p>
                  </div>
                  <div className="space-y-4">
                    <input
                      type="text"
                      placeholder="Họ và tên của bạn..."
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-bold text-slate-800"
                    />
                    <button
                      onClick={() => {
                        if (userName.trim()) {
                          // Name is set via state and saved to localStorage via useEffect
                        } else {
                          alert('Vui lòng nhập tên của bạn.');
                        }
                      }}
                      disabled={!userName.trim()}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-black py-4 rounded-2xl transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
                    >
                      Bắt đầu làm bài
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="text-center mb-8">
                    <h2 className="text-2xl font-bold text-slate-800">{testData.title}</h2>
                  </div>
                  <TestView 
                    questions={testData.questions} 
                    testCode={testData.testCode}
                    audioData={testData.audioData}
                    onFinish={handleTestFinish} 
                    onHome={handleRestart}
                    onConfirm={showConfirm}
                    initialAnswers={userAnswers.reduce((acc, curr) => ({ ...acc, [curr.questionId]: curr }), {})}
                    initialIndex={currentTestIndex}
                    startTime={testStartTime}
                    isReviewMode={isReviewMode}
                    onBackToResult={() => setState('result')}
                    onAnswerChange={(newAnswers) => {
                      const ansList = Object.values(newAnswers);
                      setUserAnswers(ansList);
                      saveProgressSafely(ansList, currentTestIndex, testData, 'in_progress');
                    }}
                    onIndexChange={(index) => {
                      setCurrentTestIndex(index);
                      saveProgressSafely(userAnswers, index, testData, 'in_progress');
                    }}
                  />
                </>
              )}
            </motion.div>
          )}

          {state === 'result' && testData && (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="w-full"
            >
              {isGeneratingPractice ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
                  <p className="font-bold text-slate-800">Đang tạo bài tập ôn tập cá nhân hóa...</p>
                </div>
              ) : (
                <ResultView 
                  testData={testData} 
                  answers={userAnswers} 
                  onPractice={handleStartPractice}
                  onRestart={handleRestart}
                  onRedo={handleRedo}
                  onReview={handleReview}
                  userName={userName}
                  onShare={handleShareTest}
                  isLoggedIn={!!user}
                />
              )}
            </motion.div>
          )}

          {state === 'practice' && practiceSets.length > 0 && (
            <motion.div
              key="practice"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full"
            >
              <PracticeView 
                practiceSets={practiceSets} 
                onBack={() => setState('result')} 
              />
            </motion.div>
          )}

          {state === 'history' && (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-4xl mx-auto"
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-3xl font-black text-slate-800 tracking-tight">LỊCH SỬ LÀM BÀI</h2>
                  <p className="text-slate-500 font-medium">Xem lại kết quả các bài thi đã thực hiện</p>
                </div>
                <div className="flex items-center gap-3">
                  {history.length > 0 && (
                    <button
                      onClick={() => {
                        showConfirm(
                          'Xóa tất cả lịch sử?',
                          'Bạn có chắc chắn muốn xóa toàn bộ lịch sử làm bài không? Hành động này không thể hoàn tác.',
                          () => setHistory([])
                        );
                      }}
                      className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-xl transition-all font-bold text-sm"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Xóa tất cả</span>
                    </button>
                  )}
                  <button
                    onClick={() => setState('library')}
                    className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                  >
                    <X className="w-6 h-6 text-slate-400" />
                  </button>
                </div>
              </div>

              {history.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center">
                  <Clock className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                  <p className="text-slate-500 font-medium">Bạn chưa thực hiện bài thi nào.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {history.map((item) => (
                    <div 
                      key={item.id}
                      className="bg-white border border-slate-200 rounded-2xl p-6 flex items-center justify-between hover:border-indigo-200 transition-all cursor-pointer group"
                      onClick={() => loadFromHistory(item)}
                    >
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg",
                          item.score >= 8 ? "bg-green-50 text-green-600" : 
                          item.score >= 5 ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"
                        )}>
                          {item.score}
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">{item.title}</h3>
                          <p className="text-sm text-slate-400">{new Date(item.date).toLocaleString('vi-VN')}</p>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteHistory(item.id);
                        }}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                        title="Xóa lịch sử bài làm này"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {state === 'shared_results' && sharedResultsTest && (
            <motion.div
              key="shared_results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full"
            >
              <SharedResultsView 
                testId={sharedResultsTest.id} 
                testTitle={sharedResultsTest.title} 
                testCode={sharedResultsTest.testCode}
                onBack={() => setState('library')} 
              />
            </motion.div>
          )}

          {state === 'global_results' && user && (
            <motion.div
              key="global_results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full"
            >
              <GlobalResultsView
                currentUserUid={user.uid}
                myTests={library}
                onBack={() => setState('library')}
                onSelectTest={(test) => {
                  setTestData(test);
                  setIsReviewMode(false);
                  setIsSharedMode(false);
                  setState('testing');
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Global Loading Overlay */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-white/80 backdrop-blur-sm z-[100] flex flex-col items-center justify-center"
          >
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-200 animate-bounce mb-4">
              <Brain className="w-8 h-8" />
            </div>
            <p className="text-slate-800 font-black text-xl animate-pulse">Đang xử lý...</p>
            <p className="text-slate-500 font-medium mt-2">Vui lòng đợi trong giây lát</p>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Confirm Modal */}
      <AnimatePresence>
        {confirmConfig.show && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmConfig(prev => ({ ...prev, show: false }))}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-md pointer-events-auto"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white rounded-[2rem] p-8 max-w-sm w-full shadow-[0_20px_50px_rgba(0,0,0,0.3)] overflow-hidden pointer-events-auto border border-slate-100"
            >
              <div className="absolute top-0 left-0 w-full h-1.5 bg-indigo-600" />
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-6">
                  {confirmConfig.title.toLowerCase().includes('xóa') ? (
                    <Trash2 className="w-8 h-8 text-red-500" />
                  ) : (
                    <HelpCircle className="w-8 h-8 text-indigo-600" />
                  )}
                </div>
                <h3 className="text-xl font-black text-slate-800 mb-2 uppercase tracking-tight">{confirmConfig.title}</h3>
                <p className="text-slate-500 font-medium leading-relaxed mb-8">{confirmConfig.message}</p>
                <div className="flex gap-3 w-full">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirmConfig.onCancel) confirmConfig.onCancel();
                      setConfirmConfig(prev => ({ ...prev, show: false }));
                    }}
                    className="flex-1 px-4 py-3.5 rounded-2xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-all active:scale-95 cursor-pointer text-sm"
                  >
                    {confirmConfig.cancelText || 'Hủy'}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      confirmConfig.onConfirm();
                      setConfirmConfig(prev => ({ ...prev, show: false }));
                    }}
                    className="flex-1 px-4 py-3.5 rounded-2xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-xl shadow-indigo-200 transition-all active:scale-95 cursor-pointer text-sm"
                  >
                    {confirmConfig.confirmText || 'Xác nhận'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Status/Message Modal */}
      <AnimatePresence>
        {statusMessage.show && (
          <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setStatusMessage(prev => ({ ...prev, show: false }))}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white rounded-[2rem] p-8 max-w-sm w-full shadow-2xl overflow-hidden border border-slate-100"
            >
              <div className={cn(
                "absolute top-0 left-0 w-full h-1.5",
                statusMessage.type === 'error' ? "bg-red-500" : statusMessage.type === 'success' ? "bg-emerald-500" : "bg-indigo-600"
              )} />
              <div className="flex flex-col items-center text-center">
                <div className={cn(
                  "w-16 h-16 rounded-2xl flex items-center justify-center mb-6",
                  statusMessage.type === 'error' ? "bg-red-50" : statusMessage.type === 'success' ? "bg-emerald-50" : "bg-indigo-50"
                )}>
                  {statusMessage.type === 'error' ? (
                    <X className="w-8 h-8 text-red-500" />
                  ) : statusMessage.type === 'success' ? (
                    <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  ) : (
                    <Info className="w-8 h-8 text-indigo-600" />
                  )}
                </div>
                <h3 className="text-xl font-black text-slate-800 mb-2 uppercase tracking-tight">{statusMessage.title}</h3>
                <p className="text-slate-500 font-medium leading-relaxed mb-8 whitespace-pre-wrap">{statusMessage.message}</p>
                <button
                  onClick={() => setStatusMessage(prev => ({ ...prev, show: false }))}
                  className="w-full py-4 rounded-2xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all active:scale-95"
                >
                  Đã hiểu
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Footer */}
      <footer className="py-8 border-t border-slate-200 text-center">
        <p className="text-slate-400 text-sm">© 2026 AI Test Master. Nền tảng ôn tập thông minh bằng trí tuệ nhân tạo.</p>
      </footer>
    </div>
  );
}
