import React, { useEffect } from "react";
import { supabase } from "@/lib/supabase";

/** Mount once near the root. Keeps Realtime's JWT fresh. */
export default function RealtimeBridge() {
  useEffect(() => {
    // initial token
    supabase.auth.getSession().then(({ data }) => {
      supabase.realtime.setAuth(data.session?.access_token ?? "");
    });

    // keep token updated
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      supabase.realtime.setAuth(session?.access_token ?? "");
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return null;
}
