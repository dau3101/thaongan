import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Lỗi giao diện bị chặn bởi ErrorBoundary:', error, errorInfo);
    // Attempt emergency backup of any ongoing test data
    try {
      const ongoing = localStorage.getItem('ai_test_master_ongoing');
      if (ongoing) {
        sessionStorage.setItem('ai_test_emergency_backup', ongoing);
      }
    } catch (e) {
      console.warn('Emergency backup failed:', e);
    }
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[300px] w-full max-w-2xl mx-auto my-8 p-6 bg-amber-50 border-2 border-amber-200 rounded-3xl text-center space-y-4 shadow-sm">
          <div className="text-4xl">⚠️</div>
          <h2 className="text-xl font-black text-amber-900">
            Có vấn đề nhỏ khi hiển thị nội dung này
          </h2>
          <p className="text-sm text-amber-800 leading-relaxed max-w-lg mx-auto">
            Đừng lo lắng! Toàn bộ tiến độ và các câu trả lời bạn vừa làm đã được hệ thống lưu trữ an toàn. Bạn có thể bấm nút dưới đây để tiếp tục.
          </p>
          <div className="pt-2 flex justify-center gap-3">
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                this.props.onReset?.();
              }}
              className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition-all shadow-md text-sm"
            >
              🔄 Tiếp tục làm bài
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 font-bold rounded-xl transition-all text-sm"
            >
              Tải lại trang
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
