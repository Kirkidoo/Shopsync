import { render, screen } from '@testing-library/react';
import { MediaManagerImageCard } from './media-manager-image-card';
import { ShopifyProductImage } from '@/lib/types';

// Mock next/image
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    // eslint-disable-next-line @next/next/no-img-element
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
    variant_ids: [],
    position: 1,
    product_id: 1,
    width: 100,
    height: 100,
    created_at: '',
    updated_at: '',
    admin_graphql_api_id: '',
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

  it('renders accessible assignment indicator when assigned', () => {
    const assignedImage = { ...mockImage, variant_ids: [456, 789] };

    render(
      <MediaManagerImageCard
        image={assignedImage}
        isSelected={false}
        isAssigned={true}
        isMissingVariantMode={false}
        isSubmitting={false}
        onSelectionChange={jest.fn()}
        onDelete={jest.fn()}
      />
    );

    // Should be a button for accessibility
    const indicator = screen.getByRole('button', { name: /assigned to 2 variant/i });
    expect(indicator).toBeInTheDocument();

    // Should contain the Link icon
    expect(screen.getByTestId('link-icon')).toBeInTheDocument();
  });
});
