import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { comparedPro } from '../../lib/pros';
import { networkError } from '../api';
import { useClub } from '../club';
import { clubQuery } from '../queries';
import { saveComparedPro } from '../writes';

/**
 * Whom the member measures against, wherever the pros show: Zen until they choose, then their choice, saved on their
 * profile for every device. A choice shows at once, and comes back undone if the API refuses it.
 */
export function useComparedPro(): { target: string; choose: (target: string) => void } {
  const { me } = useClub();
  const queryClient = useQueryClient();
  const { mutate } = useMutation({
    mutationFn: (pro: string) => saveComparedPro({ pro }),
    onMutate: async (pro) => {
      await queryClient.cancelQueries({ queryKey: clubQuery.queryKey });
      const before = queryClient.getQueryData(clubQuery.queryKey);
      queryClient.setQueryData(clubQuery.queryKey, (club) => club && { ...club, me: { ...club.me, comparedPro: pro } });
      return { before };
    },
    onError: (error, _pro, context) => {
      queryClient.setQueryData(clubQuery.queryKey, context?.before);
      toast.error(networkError(error));
    },
  });
  return { target: comparedPro(me.comparedPro), choose: mutate };
}
