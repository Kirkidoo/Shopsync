import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ActivityLogViewer } from './activity-log-viewer';
import { fetchActivityLogs, clearActivityLogs } from '@/app/actions';
import { LogEntry } from '@/lib/types';

// Mock server actions
jest.mock('@/app/actions', () => ({
  fetchActivityLogs: jest.fn(),
  clearActivityLogs: jest.fn(),
}));

// Mock lucide-react
jest.mock('lucide-react', () => ({
  Loader2: () => <div data-testid="loader" />,
  Trash2: () => <div data-testid="trash" />,
  RefreshCw: () => <div data-testid="refresh" />,
  AlertCircle: () => <div data-testid="alert-circle" />,
  CheckCircle: () => <div data-testid="check-circle" />,
  Info: () => <div data-testid="info" />,
}));

// Mock ScrollArea
jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe('ActivityLogViewer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders "No logs found" initially', async () => {
    (fetchActivityLogs as jest.Mock).mockResolvedValue([]);
    render(<ActivityLogViewer />);
    await waitFor(() => {
      expect(screen.getByText('No logs found.')).toBeInTheDocument();
    });
    // Check clear button is disabled
    const clearBtn = screen.getByText('Clear').closest('button');
    expect(clearBtn).toBeDisabled();
  });

  it('renders logs and enables clear button', async () => {
    const mockLogs: LogEntry[] = [
      { id: '1', level: 'INFO', message: 'Test log', timestamp: new Date().toISOString() },
    ];
    (fetchActivityLogs as jest.Mock).mockResolvedValue(mockLogs);

    render(<ActivityLogViewer />);

    await waitFor(() => {
      expect(screen.getByText('Test log')).toBeInTheDocument();
    });

    const clearBtn = screen.getByText('Clear').closest('button');
    expect(clearBtn).not.toBeDisabled();
  });

  it('opens confirmation dialog on clear click', async () => {
    const mockLogs: LogEntry[] = [
      { id: '1', level: 'INFO', message: 'Test log', timestamp: new Date().toISOString() },
    ];
    (fetchActivityLogs as jest.Mock).mockResolvedValue(mockLogs);
    (clearActivityLogs as jest.Mock).mockResolvedValue(undefined);

    render(<ActivityLogViewer />);

    await waitFor(() => {
      expect(screen.getByText('Test log')).toBeInTheDocument();
    });

    const clearBtn = screen.getByText('Clear');
    fireEvent.click(clearBtn);

    // Dialog should appear
    expect(screen.getByText('Clear all activity logs?')).toBeInTheDocument();

    // Click confirm
    const confirmBtn = screen.getByText('Delete Logs');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
        expect(clearActivityLogs).toHaveBeenCalled();
    });

    // Logs should be cleared
    await waitFor(() => {
      expect(screen.getByText('No logs found.')).toBeInTheDocument();
    });
  });
});
