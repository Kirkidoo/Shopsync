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

describe('MediaManagerImageCard', () => {
  const mockImage: ShopifyProductImage = {
    id: 123,
    src: 'http://example.com/img.jpg',
    variant_ids: [456, 789],
    product_id: 1,
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

  it('renders assigned indicator as a button with aria-label when assigned', () => {
    render(
      <MediaManagerImageCard
        image={mockImage}
        isSelected={false}
        isAssigned={true}
        isMissingVariantMode={false}
        isSubmitting={false}
        onSelectionChange={jest.fn()}
        onDelete={jest.fn()}
      />
    );

    const indicator = screen.getByRole('button', { name: /assigned to 2 variant/i });
    expect(indicator).toBeInTheDocument();
    expect(screen.getByTestId('link-icon')).toBeInTheDocument();
  });
});
