import { render, screen, act } from '@testing-library/react';
import { ActivityLogViewer } from './activity-log-viewer';
import { fetchActivityLogs } from '@/app/actions';

// Mock the server action
jest.mock('@/app/actions', () => ({
  fetchActivityLogs: jest.fn(),
  clearActivityLogs: jest.fn(),
}));

// Mock logger
jest.mock('@/lib/logger', () => ({
  logger: {
    error: jest.fn(),
  },
}));

// Mock lucide-react to avoid ESM issues
jest.mock('lucide-react', () => ({
  Loader2: () => <div data-testid="loader" />,
  Trash2: () => <div data-testid="trash-icon" />,
  RefreshCw: () => <div data-testid="refresh-icon" />,
  AlertCircle: () => <div data-testid="alert-circle" />,
  CheckCircle: () => <div data-testid="check-circle" />,
  Info: () => <div data-testid="info-icon" />,
}));

describe('ActivityLogViewer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders log items correctly', async () => {
    const mockLogs = [
      {
        id: '1',
        timestamp: new Date('2023-01-01T12:00:00Z').toISOString(),
        level: 'INFO',
        message: 'Test log message',
      },
      {
        id: '2',
        timestamp: new Date('2023-01-01T12:01:00Z').toISOString(),
        level: 'ERROR',
        message: 'Error log message',
        details: { code: 500 },
      },
    ];

    (fetchActivityLogs as jest.Mock).mockResolvedValue(mockLogs);

    await act(async () => {
      render(<ActivityLogViewer />);
    });

    expect(screen.getByText('Test log message')).toBeInTheDocument();
    expect(screen.getByText('Error log message')).toBeInTheDocument();
    expect(screen.getByText('INFO')).toBeInTheDocument();
    expect(screen.getByText('ERROR')).toBeInTheDocument();
  });
});
