"use client";

import { useEffect, useState } from "react";

export interface FbAdAccount {
  id: string;
  name: string;
  account_id: string;
  account_status: number;
  currency: string;
}

export interface FbAd {
  id: string;
  name: string;
  status: string;
  campaign_id?: string;
  adset_id?: string;
  creative?: { thumbnail_url?: string; image_url?: string };
}

export interface FbCampaign {
  id: string;
  name: string;
}

// Owns everything about browsing the connected Facebook account: connect/disconnect,
// the account/campaign/status filters, and the resulting ad list. `authStatus` is the
// NextAuth session status ("authenticated" | ...) — the only thing this hook needs
// from outside itself to know when it's safe to check the Facebook connection.
export function useFacebookBrowser(authStatus: string) {
  const [fbConnected, setFbConnected] = useState(false);
  const [fbAdAccounts, setFbAdAccounts] = useState<FbAdAccount[]>([]);
  const [fbSelectedAccount, setFbSelectedAccount] = useState<string>("");
  const [fbAds, setFbAds] = useState<FbAd[]>([]);
  const [fbCampaigns, setFbCampaigns] = useState<FbCampaign[]>([]);
  const [fbCampaignFilter, setFbCampaignFilter] = useState<string>("");
  const [fbAccountSearch, setFbAccountSearch] = useState("");
  const [fbCampaignSearch, setFbCampaignSearch] = useState("");
  const [fbStatusFilter, setFbStatusFilter] = useState<string>("");
  const [fbAdsLoading, setFbAdsLoading] = useState(false);
  const [fbSidebarOpen, setFbSidebarOpen] = useState(false);

  // Check FB connection on load and after OAuth redirect
  useEffect(() => {
    if (authStatus !== "authenticated") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("fb_connected") === "1") {
      window.history.replaceState({}, "", window.location.pathname);
    }
    fetch("/api/facebook")
      .then(r => r.json())
      .then(data => {
        setFbConnected(data.connected ?? false);
        setFbAdAccounts(data.adAccounts ?? []);
        if (data.connected && data.adAccounts?.length === 1) {
          setFbSelectedAccount(data.adAccounts[0].id);
        }
      });
  }, [authStatus]);

  useEffect(() => {
    if (!fbSelectedAccount) { setFbAds([]); setFbCampaigns([]); return; }
    setFbAdsLoading(true);
    const params = new URLSearchParams({ accountId: fbSelectedAccount });
    if (fbCampaignFilter) params.set("campaign", fbCampaignFilter);
    if (fbStatusFilter) params.set("status", fbStatusFilter);
    fetch(`/api/facebook/ads?${params.toString()}`)
      .then(r => r.json())
      .then(data => {
        setFbAds(data.ads ?? []);
        setFbCampaigns(data.campaigns ?? []);
      })
      .finally(() => setFbAdsLoading(false));
  }, [fbSelectedAccount, fbCampaignFilter, fbStatusFilter]);

  function connect() {
    window.location.href = "/api/auth/facebook";
  }

  async function disconnect() {
    await fetch("/api/facebook", { method: "DELETE" });
    setFbConnected(false);
    setFbAdAccounts([]);
    setFbSelectedAccount("");
    setFbAds([]);
    setFbCampaigns([]);
  }

  return {
    fbConnected,
    fbAdAccounts,
    fbSelectedAccount, setFbSelectedAccount,
    fbAds,
    fbCampaigns,
    fbCampaignFilter, setFbCampaignFilter,
    fbAccountSearch, setFbAccountSearch,
    fbCampaignSearch, setFbCampaignSearch,
    fbStatusFilter, setFbStatusFilter,
    fbAdsLoading,
    fbSidebarOpen, setFbSidebarOpen,
    connect,
    disconnect,
  };
}
