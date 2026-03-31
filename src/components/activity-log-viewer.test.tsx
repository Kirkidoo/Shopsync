import { render, screen, waitFor, act } from '@testing-library/react';
import { ActivityLogViewer } from './activity-log-viewer';
import { fetchActivityLogs, clearActivityLogs } from '@/app/actions';
import { LogEntry } from '@/lib/types';

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

// Mock lucide-react to avoid ESM issues
jest.mock('lucide-react', () => ({
  Loader2: () => <div data-testid="loader" />,
  Trash2: () => <div data-testid="trash" />,
  RefreshCw: () => <div data-testid="refresh" />,
  AlertCircle: () => <div data-testid="alert" />,
  CheckCircle: () => <div data-testid="check" />,
  Info: () => <div data-testid="info" />,
}));

// Mock ResizeObserver for ScrollArea
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe('ActivityLogViewer', () => {
  const mockLogs: LogEntry[] = [
    {
      id: '1',
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message: 'Test log message',
    },
    {
      id: '2',
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      message: 'Error log message',
      details: { error: 'Something went wrong' },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (fetchActivityLogs as jest.Mock).mockResolvedValue(mockLogs);
  });

  it('renders correctly and fetches logs', async () => {
    await act(async () => {
      render(<ActivityLogViewer />);
    });

    // Check title
    expect(screen.getByText('Activity Logs')).toBeInTheDocument();

    // Check logs are displayed
    await waitFor(() => {
      expect(screen.getByText('Test log message')).toBeInTheDocument();
      expect(screen.getByText('Error log message')).toBeInTheDocument();
    });

    expect(fetchActivityLogs).toHaveBeenCalled();
  });

  it('displays "No logs found" when empty', async () => {
    (fetchActivityLogs as jest.Mock).mockResolvedValue([]);

    await act(async () => {
      render(<ActivityLogViewer />);
    });

    await waitFor(() => {
      expect(screen.getByText('No logs found.')).toBeInTheDocument();
    });
  });

  it('renders memoized component with correct display name', () => {
    expect(ActivityLogViewer.displayName).toBe('ActivityLogViewer');
  });
});
