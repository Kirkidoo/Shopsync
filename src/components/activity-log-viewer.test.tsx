import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ActivityLogViewer } from './activity-log-viewer';
import * as actions from '@/app/actions';

// Mock lucide-react to avoid ESM issues
jest.mock('lucide-react', () => ({
  Loader2: () => <div data-testid="loader" />,
  Trash2: () => <div data-testid="trash-icon" />,
  RefreshCw: () => <div data-testid="refresh-icon" />,
  AlertCircle: () => <div data-testid="alert-icon" />,
  CheckCircle: () => <div data-testid="check-icon" />,
  Info: () => <div data-testid="info-icon" />,
}));

// Mock server actions
jest.mock('@/app/actions', () => ({
  fetchActivityLogs: jest.fn(),
  clearActivityLogs: jest.fn(),
}));

// Mock ResizeObserver for ScrollArea
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe('ActivityLogViewer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders and fetches logs', async () => {
    (actions.fetchActivityLogs as jest.Mock).mockResolvedValue([
      { id: '1', level: 'INFO', message: 'Test log', timestamp: new Date().toISOString() },
    ]);

    await act(async () => {
      render(<ActivityLogViewer />);
    });

    expect(actions.fetchActivityLogs).toHaveBeenCalled();
    expect(screen.getByText('Activity Logs')).toBeInTheDocument();
  });

  it('renders clear button and opens dialog', async () => {
    (actions.fetchActivityLogs as jest.Mock).mockResolvedValue([]);
    await act(async () => {
      render(<ActivityLogViewer />);
    });

    const clearButton = screen.getByText('Clear');
    expect(clearButton).toBeInTheDocument();

    // Click clear button to open dialog
    fireEvent.click(clearButton);

    // Check for dialog content
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
    expect(screen.getByText(/This will permanently clear all activity logs/)).toBeInTheDocument();

    // Click confirmation
    const confirmButton = screen.getByText('Clear Logs');
    await act(async () => {
      fireEvent.click(confirmButton);
    });

    expect(actions.clearActivityLogs).toHaveBeenCalled();
  });
});
