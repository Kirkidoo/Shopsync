import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ActivityLogViewer } from './activity-log-viewer';
import { fetchActivityLogs, clearActivityLogs } from '@/app/actions';

// Mock server actions
jest.mock('@/app/actions', () => ({
  fetchActivityLogs: jest.fn(),
  clearActivityLogs: jest.fn(),
}));

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock scrollIntoView
window.HTMLElement.prototype.scrollIntoView = jest.fn();

// Mock logger
jest.mock('@/lib/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
  },
}));

// Mock lucide-react
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
  });

  it('renders and fetches logs', async () => {
    (fetchActivityLogs as jest.Mock).mockResolvedValue([
      { id: '1', timestamp: new Date().toISOString(), level: 'INFO', message: 'Test log' },
    ]);

    render(<ActivityLogViewer />);

    expect(screen.getByText('Activity Logs')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Test log')).toBeInTheDocument();
    });
  });

  it('clears logs when confirmed', async () => {
    (fetchActivityLogs as jest.Mock).mockResolvedValue([
      { id: '1', timestamp: new Date().toISOString(), level: 'INFO', message: 'Log to clear' },
    ]);
    (clearActivityLogs as jest.Mock).mockResolvedValue(undefined);

    render(<ActivityLogViewer />);

    await waitFor(() => {
      expect(screen.getByText('Log to clear')).toBeInTheDocument();
    });

    const clearButton = screen.getByText('Clear');
    fireEvent.click(clearButton);

    // Dialog should open
    expect(screen.getByText('Are you absolutely sure?')).toBeInTheDocument();

    const continueButton = screen.getByText('Continue');
    fireEvent.click(continueButton);

    expect(clearActivityLogs).toHaveBeenCalled();
  });
});
