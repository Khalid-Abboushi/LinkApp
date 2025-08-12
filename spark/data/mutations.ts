import { supabase } from '@/lib/supabase';

export async function createParty(name: string, picture_url?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('parties')
    .insert([{ name, owner_id: user.id, picture_url }])
    .select()
    .single();
  if (error) throw error;
  return data; // triggers will auto-add owner to party_members and create chats row
}

export async function addMember(partyId: string, userId: string, role: 'admin'|'member'='member') {
  const { error } = await supabase
    .from('party_members')
    .insert([{ party_id: partyId, user_id: userId, role }]);
  if (error) throw error;
}
