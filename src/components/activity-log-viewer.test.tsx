
import React from 'react';
import { render, screen } from '@testing-library/react';
import { ActivityLogViewer } from './activity-log-viewer';
import * as actions from '@/app/actions';

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

jest.mock('lucide-react', () => ({
  Loader2: () => <div data-testid="Loader2" />,
  Trash2: () => <div data-testid="Trash2" />,
  RefreshCw: () => <div data-testid="RefreshCw" />,
  AlertCircle: () => <div data-testid="AlertCircle" />,
  CheckCircle: () => <div data-testid="CheckCircle" />,
  Info: () => <div data-testid="Info" />,
}));

describe('ActivityLogViewer', () => {
  it('renders correctly', async () => {
    (actions.fetchActivityLogs as jest.Mock).mockResolvedValue([
      {
        id: '1',
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: 'Test log message',
      },
    ]);

    render(<ActivityLogViewer />);

    expect(await screen.findByText('Activity Logs')).toBeInTheDocument();
    expect(await screen.findByText('Test log message')).toBeInTheDocument();
  });
});
