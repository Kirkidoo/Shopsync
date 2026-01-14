import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ActivityLogViewer } from './activity-log-viewer';
import { fetchActivityLogs, clearActivityLogs } from '@/app/actions';

// Mock dependencies
jest.mock('@/app/actions', () => ({
  fetchActivityLogs: jest.fn(),
  clearActivityLogs: jest.fn(),
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    error: jest.fn(),
  },
}));

// Mock ResizeObserver which is used by ScrollArea
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock ScrollArea
jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock Lucide icons
jest.mock('lucide-react', () => ({
  Loader2: () => <div data-testid="loader" />,
  Trash2: () => <div data-testid="trash-icon" />,
  RefreshCw: () => <div data-testid="refresh-icon" />,
  AlertCircle: () => <div data-testid="alert-icon" />,
  CheckCircle: () => <div data-testid="check-icon" />,
  Info: () => <div data-testid="info-icon" />,
}));

describe('ActivityLogViewer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetchActivityLogs as jest.Mock).mockResolvedValue([]);
  });

  it('renders correctly', async () => {
    render(<ActivityLogViewer />);
    expect(screen.getByText('Activity Logs')).toBeInTheDocument();
    expect(screen.getByText('Clear')).toBeInTheDocument();
  });

  it('handles clear logs', async () => {
    // Mock logs to enable clear button (if we add disabled logic later, this helps)
    (fetchActivityLogs as jest.Mock).mockResolvedValue([
      { id: 1, level: 'INFO', message: 'Test log', timestamp: Date.now() },
    ]);

    render(<ActivityLogViewer />);

    // Wait for logs to load
    await waitFor(() => {
      expect(fetchActivityLogs).toHaveBeenCalled();
    });

    // We expect the clear button to be present
    const clearButton = screen.getByText('Clear').closest('button');
    expect(clearButton).toBeInTheDocument();

    // In current implementation it uses window.confirm.
    // We will later change this to AlertDialog.
    // For now, let's just ensure it exists.
  });
});
