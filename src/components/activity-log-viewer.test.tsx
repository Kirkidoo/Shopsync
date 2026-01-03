
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ActivityLogViewer } from './activity-log-viewer';
import { clearActivityLogs, fetchActivityLogs } from '@/app/actions';

// Mock the actions
jest.mock('@/app/actions', () => ({
  clearActivityLogs: jest.fn(),
  fetchActivityLogs: jest.fn(),
}));

// Mock ResizeObserver for ScrollArea
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock lucide-react entirely to avoid ESM issues
jest.mock('lucide-react', () => ({
  Loader2: () => <div data-testid="loader" />,
  Trash2: () => <div data-testid="trash-icon" />,
  RefreshCw: () => <div data-testid="refresh-icon" />,
  AlertCircle: () => <div data-testid="alert-circle" />,
  CheckCircle: () => <div data-testid="check-circle" />,
  Info: () => <div data-testid="info-icon" />,
}));

// Since Radix Dialog uses portals, we might need to mock it or handle portals in tests.
// However, JSDOM should handle basic portals if we look in the document body.

describe('ActivityLogViewer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetchActivityLogs as jest.Mock).mockResolvedValue([]);
  });

  it('renders correctly', async () => {
    render(<ActivityLogViewer />);
    expect(screen.getByText('Activity Logs')).toBeInTheDocument();
  });

  it('calls clearActivityLogs when delete is confirmed in AlertDialog', async () => {
    render(<ActivityLogViewer />);

    const clearButton = screen.getByText('Clear');
    fireEvent.click(clearButton);

    // Dialog should appear
    expect(screen.getByText('Clear Activity Logs?')).toBeInTheDocument();

    const deleteButton = screen.getByText('Delete Logs');
    fireEvent.click(deleteButton);

    await waitFor(() => {
        expect(clearActivityLogs).toHaveBeenCalled();
    });
  });
});
