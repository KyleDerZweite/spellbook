"use client";

import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Card as CardType } from '@/types/card';
import withAuth from '@/components/auth/withAuth';
import { useParams } from 'next/navigation';

async function getCollectionCards(id: string): Promise<CardType[]> {
  const { data } = await axios.get(`/api/v1/collections/${id}/cards`);
  return data;
}

function CollectionDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const { data: cards, isLoading } = useQuery({
    queryKey: ['collection', id],
    queryFn: () => getCollectionCards(id),
    enabled: !!id
  });

  return (
    <div>
      <h1 className="text-3xl font-bold mb-4">Collection</h1>
      {isLoading ? (
        <p>Loading...</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {cards?.map((card) => (
            <img key={card.id} src={card.image_uris?.normal || card.image_uris?.small || '/placeholder-card.png'} alt={card.name} className="rounded-lg" />
          ))}
        </div>
      )}
    </div>
  );
}

export default withAuth(CollectionDetailPage);