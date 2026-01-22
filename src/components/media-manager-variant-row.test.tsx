import { render, screen } from '@testing-library/react';
import { VariantRow } from './media-manager-variant-row';
import { ShopifyProductImage, Product } from '@/lib/types';
import { Table, TableBody } from '@/components/ui/table';

// Mock the UI components to avoid Radix issues and focus on logic
jest.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange, disabled }: any) => (
    <div data-testid="select" data-value={value} data-disabled={disabled}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: any) => <button>{children}</button>,
  SelectValue: () => <span>Select Value</span>,
  SelectContent: ({ children }: any) => <div data-testid="select-content">{children}</div>,
  SelectItem: ({ children, value }: any) => (
    <div data-testid="select-item" data-value={value}>
      {children}
    </div>
  ),
}));

// Mock Image to avoid Next.js Image issues
jest.mock('next/image', () => ({
  __esModule: true,
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: any) => <img src={src} alt={alt} />,
}));

describe('VariantRow', () => {
  const mockVariant: Partial<Product> = {
    variantId: 'gid://shopify/ProductVariant/123',
    sku: 'SKU-123',
    option1Value: 'Blue',
    imageId: 101,
  };

  const mockImages: ShopifyProductImage[] = [
    { id: 101, src: 'img1.jpg', product_id: 1, variant_ids: [] },
    { id: 102, src: 'img2.jpg', product_id: 1, variant_ids: [] },
  ];

  const mockOnAssign = jest.fn();

  const renderWithTable = (ui: React.ReactElement) => {
    return render(
      <Table>
        <TableBody>{ui}</TableBody>
      </Table>
    );
  };

  it('renders correctly', () => {
    renderWithTable(
      <VariantRow
        variant={mockVariant}
        images={mockImages}
        isSubmitting={false}
        onAssign={mockOnAssign}
      />
    );

    expect(screen.getByText('SKU-123')).toBeInTheDocument();
    expect(screen.getByText('Blue')).toBeInTheDocument();
  });

  it('renders image options in SelectContent', () => {
    renderWithTable(
      <VariantRow
        variant={mockVariant}
        images={mockImages}
        isSubmitting={false}
        onAssign={mockOnAssign}
      />
    );

    // With our mock, SelectContent is always rendered, so we can verify items are present
    const items = screen.getAllByTestId('select-item');
    // 1 for "No Image" + 2 images
    expect(items).toHaveLength(3);
  });
});
