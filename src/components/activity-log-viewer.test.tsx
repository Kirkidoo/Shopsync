import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ActivityLogViewer } from './activity-log-viewer';
import { fetchActivityLogs, clearActivityLogs } from '@/app/actions';

// Mock server actions
jest.mock('@/app/actions', () => ({
  fetchActivityLogs: jest.fn(),
  clearActivityLogs: jest.fn(),
}));

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock lucide-react
jest.mock('lucide-react', () => ({
  Loader2: () => <svg data-testid="loader-icon" />,
  Trash2: () => <svg data-testid="trash-icon" />,
  RefreshCw: () => <svg data-testid="refresh-icon" />,
  AlertCircle: () => <svg data-testid="alert-circle-icon" />,
  CheckCircle: () => <svg data-testid="check-circle-icon" />,
  Info: () => <svg data-testid="info-icon" />,
}));

describe('ActivityLogViewer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly', async () => {
    (fetchActivityLogs as jest.Mock).mockResolvedValue([]);
    render(<ActivityLogViewer />);
    expect(screen.getByText('Activity Logs')).toBeInTheDocument();
  });

  it('opens alert dialog when clear button is clicked', async () => {
    (fetchActivityLogs as jest.Mock).mockResolvedValue([
      { id: '1', level: 'INFO', message: 'Test log', timestamp: new Date().toISOString() },
    ]);
    render(<ActivityLogViewer />);

    // Wait for logs to load
    await waitFor(() => {
      expect(screen.getByText('Test log')).toBeInTheDocument();
    });

    const clearButton = screen.getByText('Clear');
    fireEvent.click(clearButton);

    // Expect AlertDialog content to appear
    expect(screen.getByText('Are you sure you want to clear all logs?')).toBeInTheDocument();
    expect(screen.getByText(/This action cannot be undone/)).toBeInTheDocument();
  });

  it('calls clearActivityLogs when confirmed', async () => {
    (fetchActivityLogs as jest.Mock).mockResolvedValue([
      { id: '1', level: 'INFO', message: 'Test log', timestamp: new Date().toISOString() },
    ]);
    render(<ActivityLogViewer />);

    // Wait for logs to load
    await waitFor(() => {
      expect(screen.getByText('Test log')).toBeInTheDocument();
    });

    const clearButton = screen.getByText('Clear');
    fireEvent.click(clearButton);

    const confirmButton = screen.getByText('Yes, Clear Logs');
    fireEvent.click(confirmButton);

    expect(clearActivityLogs).toHaveBeenCalled();
  });
});
