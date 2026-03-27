import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ActivityLogViewer } from './activity-log-viewer';
import { fetchActivityLogs, clearActivityLogs } from '@/app/actions';

// Mock dependencies
jest.mock('@/app/actions', () => ({
  fetchActivityLogs: jest.fn(),
  clearActivityLogs: jest.fn(),
}));

jest.mock('lucide-react', () => ({
  Loader2: () => <div data-testid="loader" />,
  Trash2: () => <div data-testid="trash-icon" />,
  RefreshCw: () => <div data-testid="refresh-icon" />,
  AlertCircle: () => <div data-testid="alert-icon" />,
  CheckCircle: () => <div data-testid="check-icon" />,
  Info: () => <div data-testid="info-icon" />,
}));

// Mock ScrollArea since it uses ResizeObserver and complex DOM
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

  it('renders empty state initially', async () => {
    (fetchActivityLogs as jest.Mock).mockResolvedValue([]);
    render(<ActivityLogViewer />);

    expect(screen.getByText('Activity Logs')).toBeInTheDocument();
    expect(await screen.findByText('No activity logs found.')).toBeInTheDocument();
  });

  it('renders logs when fetched', async () => {
    const mockLogs = [
      {
        id: '1',
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: 'Test log message',
      },
    ];
    (fetchActivityLogs as jest.Mock).mockResolvedValue(mockLogs);

    render(<ActivityLogViewer />);

    expect(await screen.findByText('Test log message')).toBeInTheDocument();
  });

  it('disables clear button when logs are empty', async () => {
    (fetchActivityLogs as jest.Mock).mockResolvedValue([]);
    render(<ActivityLogViewer />);

    // Wait for load
    await screen.findByText('No activity logs found.');

    const clearButton = screen.getByText('Clear').closest('button');
    expect(clearButton).toBeDisabled();
  });

  it('enables clear button when logs exist', async () => {
     const mockLogs = [
      {
        id: '1',
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: 'Test log message',
      },
    ];
    (fetchActivityLogs as jest.Mock).mockResolvedValue(mockLogs);
    render(<ActivityLogViewer />);

    await screen.findByText('Test log message');

    const clearButton = screen.getByText('Clear').closest('button');
    expect(clearButton).not.toBeDisabled();
  });

  it('triggers refresh when refresh button clicked', async () => {
    (fetchActivityLogs as jest.Mock).mockResolvedValue([]);
    render(<ActivityLogViewer />);

    // Wait for initial load to finish
    await screen.findByText('No activity logs found.');

    const refreshButton = screen.getByText('Refresh').closest('button');
    expect(refreshButton).toBeInTheDocument();
    expect(refreshButton).not.toBeDisabled();

    fireEvent.click(refreshButton!);

    // Should call fetchActivityLogs twice (initial + click)
    await waitFor(() => {
        expect(fetchActivityLogs).toHaveBeenCalledTimes(2);
    });
  });

  it('opens confirmation dialog when clear is clicked', async () => {
     const mockLogs = [
      {
        id: '1',
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: 'Test log message',
      },
    ];
    (fetchActivityLogs as jest.Mock).mockResolvedValue(mockLogs);
    render(<ActivityLogViewer />);

    await screen.findByText('Test log message');

    const clearButton = screen.getByText('Clear').closest('button');
    fireEvent.click(clearButton!);

    // Check for dialog content
    expect(await screen.findByText('Clear all activity logs?')).toBeInTheDocument();
  });
});
