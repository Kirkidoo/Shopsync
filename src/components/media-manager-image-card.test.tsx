import { render, screen } from '@testing-library/react';
import { MediaManagerImageCard } from './media-manager-image-card';
import { ShopifyProductImage } from '@/lib/types';

// Mock next/image
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

// Mock lucide-react
jest.mock('lucide-react', () => ({
  Trash2: () => <svg data-testid="trash-icon" />,
  Link: () => <svg data-testid="link-icon" />,
  Check: () => <svg data-testid="check-icon" />,
}));

// Mock ResizeObserver for Tooltip
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe('MediaManagerImageCard', () => {
  const mockImage: ShopifyProductImage = {
    id: 123,
    product_id: 1,
    src: 'http://example.com/img.jpg',
    variant_ids: [],
  };

  it('renders checkbox with aria-label', () => {
    render(
      <MediaManagerImageCard
        image={mockImage}
        isSelected={false}
        isAssigned={false}
        isMissingVariantMode={false}
        isSubmitting={false}
        onSelectionChange={jest.fn()}
        onDelete={jest.fn()}
      />
    );

    const checkbox = screen.getByRole('checkbox', { name: /select image 123/i });
    expect(checkbox).toBeInTheDocument();
  });

  it('renders delete button with aria-label', () => {
    render(
      <MediaManagerImageCard
        image={mockImage}
        isSelected={true}
        isAssigned={false}
        isMissingVariantMode={false}
        isSubmitting={false}
        onSelectionChange={jest.fn()}
        onDelete={jest.fn()}
      />
    );

    const deleteButton = screen.getByRole('button', { name: /delete image 123/i });
    expect(deleteButton).toBeInTheDocument();
  });
});
