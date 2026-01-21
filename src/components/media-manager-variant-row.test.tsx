import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VariantRow, ImageOption } from './media-manager-variant-row';
import userEvent from '@testing-library/user-event';

// Mock next/image
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} alt={props.alt || ''} />;
  },
}));

// Mock Lucide icons for Select component
jest.mock('lucide-react', () => ({
  ChevronDown: () => <div data-testid="chevron-down" />,
  Check: () => <div data-testid="check" />,
}));

// Mock Select component to avoid Radix UI complexity in unit tests
jest.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange, disabled }: any) => (
    <div data-testid="select-root">
      <select
        data-testid="select-native"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        disabled={disabled}
      >
        {children}
      </select>
    </div>
  ),
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ children, value }: any) => (
    <option value={value}>{value === 'none' ? 'No Image' : `Image #${value}`}</option>
  ),
}));

describe('VariantRow', () => {
  const mockImageOptions: ImageOption[] = [
    { id: 101, src: 'https://example.com/1.jpg' },
    { id: 102, src: 'https://example.com/2.jpg' },
  ];

  const defaultProps = {
    id: 'var-1',
    sku: 'SKU-123',
    optionDisplay: 'Blue / Large',
    imageId: null,
    imageOptions: mockImageOptions,
    isSubmitting: false,
    onAssign: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders variant info correctly', () => {
    render(
      <table>
        <tbody>
          <VariantRow {...defaultProps} />
        </tbody>
      </table>
    );

    expect(screen.getByText('SKU-123')).toBeInTheDocument();
    expect(screen.getByText('Blue / Large')).toBeInTheDocument();
  });

  it('calls onAssign when selecting an image', async () => {
    const user = userEvent.setup();
    render(
      <table>
        <tbody>
          <VariantRow {...defaultProps} />
        </tbody>
      </table>
    );

    const select = screen.getByTestId('select-native');
    await user.selectOptions(select, '101');

    expect(defaultProps.onAssign).toHaveBeenCalledWith('var-1', 101);
  });

  it('calls onAssign with null when selecting "No Image"', async () => {
    const user = userEvent.setup();
    render(
      <table>
        <tbody>
          <VariantRow {...defaultProps} imageId={101} />
        </tbody>
      </table>
    );

    const select = screen.getByTestId('select-native');
    await user.selectOptions(select, 'none');

    expect(defaultProps.onAssign).toHaveBeenCalledWith('var-1', null);
  });

  it('is disabled when isSubmitting is true', () => {
    render(
      <table>
        <tbody>
          <VariantRow {...defaultProps} isSubmitting={true} />
        </tbody>
      </table>
    );

    const select = screen.getByTestId('select-native');
    expect(select).toBeDisabled();
  });
});
