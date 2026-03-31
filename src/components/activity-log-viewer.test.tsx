
import React from 'react';
import { render, screen } from '@testing-library/react';
import { ActivityLogViewer } from './activity-log-viewer';

// Mock the server actions
jest.mock('@/app/actions', () => ({
  fetchActivityLogs: jest.fn().mockResolvedValue([]),
  clearActivityLogs: jest.fn().mockResolvedValue(),
}));

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  Loader2: () => <div data-testid="loader" />,
  Trash2: () => <div data-testid="trash-icon" />,
  RefreshCw: () => <div data-testid="refresh-icon" />,
  AlertCircle: () => <div data-testid="alert-icon" />,
  CheckCircle: () => <div data-testid="check-icon" />,
  Info: () => <div data-testid="info-icon" />,
}));

// Mock ResizeObserver
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe('ActivityLogViewer', () => {
  it('renders correctly', () => {
    render(<ActivityLogViewer />);
    expect(screen.getByText('Activity Logs')).toBeInTheDocument();
  });

  it('renders Clear button', () => {
    render(<ActivityLogViewer />);
    const clearButton = screen.getByText('Clear');
    expect(clearButton).toBeInTheDocument();
  });
});
