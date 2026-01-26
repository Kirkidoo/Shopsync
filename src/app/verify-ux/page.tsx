'use client';

import { MediaManagerImageCard } from '@/components/media-manager-image-card';
import { ShopifyProductImage } from '@/lib/types';

export default function VerifyUxPage() {
  const mockImage: ShopifyProductImage = {
    id: 123,
    src: 'https://placehold.co/150x150.png',
    variant_ids: [456, 789],
    position: 1,
    product_id: 1,
    width: 150,
    height: 150,
    created_at: '',
    updated_at: '',
    admin_graphql_api_id: '',
  };

  return (
    <div className="p-8 flex gap-4">
      <MediaManagerImageCard
        image={mockImage}
        isSelected={false}
        isAssigned={true}
        isMissingVariantMode={false}
        isSubmitting={false}
        onSelectionChange={() => {}}
        onDelete={() => {}}
      />
    </div>
  );
}
