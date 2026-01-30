import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ActivityLogViewer } from './activity-log-viewer';
import * as actions from '@/app/actions';

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock actions
jest.mock('@/app/actions', () => ({
  fetchActivityLogs: jest.fn(),
  clearActivityLogs: jest.fn(),
}));

// Mock Lucide icons
jest.mock('lucide-react', () => ({
  Loader2: () => <div data-testid="icon-loader" />,
  Trash2: () => <div data-testid="icon-trash" />,
  RefreshCw: () => <div data-testid="icon-refresh" />,
  AlertCircle: () => <div data-testid="icon-alert" />,
  CheckCircle: () => <div data-testid="icon-check" />,
  Info: () => <div data-testid="icon-info" />,
}));

describe('ActivityLogViewer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (actions.fetchActivityLogs as jest.Mock).mockResolvedValue([]);
    // Mock window.confirm to avoid jsdom errors before we replace it
    window.confirm = jest.fn(() => false);
  });

  it('renders correctly', async () => {
    render(<ActivityLogViewer />);
    expect(screen.getByText('Activity Logs')).toBeInTheDocument();
    // Wait for initial load to finish
    await waitFor(() => {
        expect(actions.fetchActivityLogs).toHaveBeenCalled();
    });
  });

  it('opens alert dialog when clear is clicked', async () => {
    render(<ActivityLogViewer />);

    const clearButton = screen.getByRole('button', { name: /clear/i });
    fireEvent.click(clearButton);

    // This assertion expects the AlertDialog to be implemented.
    // We expect a proper Dialog title and description
    expect(await screen.findByText('Clear all logs?')).toBeInTheDocument();
    expect(screen.getByText(/This action cannot be undone/)).toBeInTheDocument();

    // Check for action button (Delete or Continue)
    const deleteButton = screen.getByRole('button', { name: 'Clear Logs' });
    expect(deleteButton).toBeInTheDocument();

    // Verify action
    fireEvent.click(deleteButton);
    await waitFor(() => {
        expect(actions.clearActivityLogs).toHaveBeenCalled();
    });
  });
});
