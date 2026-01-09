import { render, screen, fireEvent } from '@testing-library/react';
import { ActivityLogViewer } from './activity-log-viewer';
import { fetchActivityLogs, clearActivityLogs } from '@/app/actions';

// Mock the server actions
jest.mock('@/app/actions', () => ({
  fetchActivityLogs: jest.fn(),
  clearActivityLogs: jest.fn(),
}));

// Mock the UI components that are not strictly unit tested here or cause issues
jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock ResizeObserver for ScrollArea if needed
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

describe('ActivityLogViewer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly and shows "No logs found" initially', async () => {
    (fetchActivityLogs as jest.Mock).mockResolvedValue([]);
    render(<ActivityLogViewer />);
    expect(screen.getByText('Activity Logs')).toBeInTheDocument();
    expect(await screen.findByText('No logs found.')).toBeInTheDocument();
  });

  it('renders logs when fetchActivityLogs returns data', async () => {
    const mockLogs = [
      { id: '1', timestamp: new Date().toISOString(), level: 'INFO', message: 'Test log 1' },
    ];
    (fetchActivityLogs as jest.Mock).mockResolvedValue(mockLogs);

    render(<ActivityLogViewer />);

    expect(await screen.findByText('Test log 1')).toBeInTheDocument();
  });

  it('opens alert dialog when Clear button is clicked', async () => {
    const mockLogs = [
      { id: '1', timestamp: new Date().toISOString(), level: 'INFO', message: 'Test log 1' },
    ];
    (fetchActivityLogs as jest.Mock).mockResolvedValue(mockLogs);

    render(<ActivityLogViewer />);

    // Wait for logs to load so Clear button is enabled
    await screen.findByText('Test log 1');

    const clearButton = screen.getByText('Clear');
    fireEvent.click(clearButton);

    // Check if Alert Dialog content appears
    expect(await screen.findByText('Clear all logs?')).toBeInTheDocument();
    expect(screen.getByText('This will permanently delete all activity logs. This action cannot be undone.')).toBeInTheDocument();
  });

  it('calls clearActivityLogs when confirmed in Alert Dialog', async () => {
    const mockLogs = [
      { id: '1', timestamp: new Date().toISOString(), level: 'INFO', message: 'Test log 1' },
    ];
    (fetchActivityLogs as jest.Mock).mockResolvedValue(mockLogs);

    render(<ActivityLogViewer />);
    await screen.findByText('Test log 1');

    fireEvent.click(screen.getByText('Clear'));

    const confirmButton = await screen.findByText('Yes, Clear All');
    fireEvent.click(confirmButton);

    expect(clearActivityLogs).toHaveBeenCalled();
  });
});
