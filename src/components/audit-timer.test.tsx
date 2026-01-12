import { render, screen, act } from '@testing-library/react';
import { AuditTimer } from './audit-timer';

describe('AuditTimer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders initial time as 0:00', () => {
    render(<AuditTimer isRunning={false} />);
    expect(screen.getByText('0:00')).toBeInTheDocument();
  });

  it('starts timing when isRunning is true', () => {
    render(<AuditTimer isRunning={true} />);

    expect(screen.getByText('0:00')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByText('0:01')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(59000);
    });
    expect(screen.getByText('1:00')).toBeInTheDocument();
  });

  it('stops updating and resets when isRunning becomes false', () => {
    const { rerender } = render(<AuditTimer isRunning={true} />);

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(screen.getByText('0:05')).toBeInTheDocument();

    rerender(<AuditTimer isRunning={false} />);

    expect(screen.getByText('0:00')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    // Should stay at 0:00
    expect(screen.getByText('0:00')).toBeInTheDocument();
  });
});
