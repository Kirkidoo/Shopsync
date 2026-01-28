import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ActivityLogViewer } from './activity-log-viewer';
import { fetchActivityLogs, clearActivityLogs } from '@/app/actions';

// Mock dependencies
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

// Mock lucide-react
jest.mock('lucide-react', () => ({
  Loader2: () => <div data-testid="icon-loader" />,
  Trash2: () => <div data-testid="icon-trash" />,
  RefreshCw: () => <div data-testid="icon-refresh" />,
  AlertCircle: () => <div data-testid="icon-alert" />,
  CheckCircle: () => <div data-testid="icon-check" />,
  Info: () => <div data-testid="icon-info" />,
}));

// Mock scroll area to avoid complex structure issues in tests
jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children, className }: { children: React.ReactNode; className: string }) => (
    <div className={className} data-testid="scroll-area">
      {children}
    </div>
  ),
}));

describe('ActivityLogViewer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders logs correctly', async () => {
    const logs = [
      {
        id: '1',
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: 'Test Log Message',
      },
    ];
    (fetchActivityLogs as jest.Mock).mockResolvedValue(logs);

    await act(async () => {
      render(<ActivityLogViewer />);
    });

    await waitFor(() => {
      expect(screen.getByText('Test Log Message')).toBeInTheDocument();
    });
  });

  it('clears logs when confirmed via AlertDialog', async () => {
    const logs = [
      {
        id: '1',
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: 'Log to be cleared',
      },
    ];
    (fetchActivityLogs as jest.Mock).mockResolvedValue(logs);

    // Mock window.confirm to ensure it's NOT called
    const confirmSpy = jest.spyOn(window, 'confirm');

    await act(async () => {
      render(<ActivityLogViewer />);
    });

    await waitFor(() => {
      expect(screen.getByText('Log to be cleared')).toBeInTheDocument();
    });

    const clearButton = screen.getByText('Clear');

    await act(async () => {
        fireEvent.click(clearButton);
    });

    // Check window.confirm was NOT called
    expect(confirmSpy).not.toHaveBeenCalled();

    // Check dialog appeared
    // Note: Radix UI portals might render outside the container, but screen.getByText should find it in the document
    expect(screen.getByText('Clear all activity logs?')).toBeInTheDocument();

    // Click "Cancel" first
    const cancelButton = screen.getByText('Cancel');
    await act(async () => {
        fireEvent.click(cancelButton);
    });

    // Expect dialog to close (implying clearActivityLogs should NOT be called yet)
    expect(clearActivityLogs).not.toHaveBeenCalled();

    // Re-open dialog if it closed (Testing Library doesn't simulate full Portal unmounting perfectly always, but let's assume standard behavior)
    // Actually, usually we need to re-click the trigger.
    await act(async () => {
        fireEvent.click(clearButton);
    });

    // Click "Clear Logs" (Action)
    const confirmButton = screen.getByText('Clear Logs');
    await act(async () => {
        fireEvent.click(confirmButton);
    });

    expect(clearActivityLogs).toHaveBeenCalled();

    // Verify logs are cleared from UI
    await waitFor(() => {
        expect(screen.queryByText('Log to be cleared')).not.toBeInTheDocument();
    });

    confirmSpy.mockRestore();
  });
});
