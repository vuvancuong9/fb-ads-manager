import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const serviceClient = await createServiceClient()
    const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).single()
    const isAdmin = profile?.role === "admin"

    const { action, params } = await request.json()

    if (action === "pause_campaign" || action === "activate_campaign") {
      const campaignName = params?.campaignName
      const campaignId = params?.campaignId
      const newStatus = action === "pause_campaign" ? "PAUSED" : "ACTIVE"

      let campaign: any = null
      if (campaignId) {
        const { data } = await serviceClient.from("campaigns").select("*, fb_ad_account:fb_ad_accounts(access_token)").eq("id", campaignId).single()
        campaign = data
      } else if (campaignName) {
        const { data } = await serviceClient.from("campaigns").select("*, fb_ad_account:fb_ad_accounts(access_token)").ilike("name", `%${campaignName}%`).eq("status", "ACTIVE").limit(1).single()
        campaign = data
        if (!campaign) {
          const fb = await serviceClient.from("campaigns").select("*, fb_ad_account:fb_ad_accounts(access_token)").ilike("name", `%${campaignName}%`).limit(1).single()
          campaign = fb.data
        }
      }

      if (!campaign) return NextResponse.json({ success: false, message: `Campagna "${campaignName || campaignId}" non trovata` })

      const token = (campaign.fb_ad_account as any)?.access_token
      if (!token) return NextResponse.json({ success: false, message: "Token mancante per questo account" })

      const fbRes = await fetch(`https://graph.facebook.com/v21.0/${campaign.fb_campaign_id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, access_token: token }),
      })

      if (!fbRes.ok) {
        const err = await fbRes.json().catch(() => ({}))
        return NextResponse.json({ success: false, message: err?.error?.message || `Facebook API error ${fbRes.status}` })
      }

      await serviceClient.from("campaigns").update({ status: newStatus }).eq("id", campaign.id)

      return NextResponse.json({
        success: true,
        message: `Campagna "${campaign.name}" ${newStatus === "PAUSED" ? "messa in pausa" : "attivata"} con successo`,
      })
    }

    if (action === "pause_multiple" || action === "activate_multiple") {
      const campaignNames: string[] = params?.campaignNames || []
      const newStatus = action === "pause_multiple" ? "PAUSED" : "ACTIVE"
      const results: string[] = []

      for (const name of campaignNames) {
        const { data: campaign } = await serviceClient.from("campaigns").select("*, fb_ad_account:fb_ad_accounts(access_token)").ilike("name", `%${name}%`).limit(1).single()
        if (!campaign) { results.push(`"${name}": non trovata`); continue }

        const token = (campaign.fb_ad_account as any)?.access_token
        if (!token) { results.push(`"${name}": token mancante`); continue }

        const fbRes = await fetch(`https://graph.facebook.com/v21.0/${campaign.fb_campaign_id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus, access_token: token }),
        })

        if (fbRes.ok) {
          await serviceClient.from("campaigns").update({ status: newStatus }).eq("id", campaign.id)
          results.push(`"${campaign.name}": ${newStatus === "PAUSED" ? "pausata" : "attivata"}`)
        } else {
          results.push(`"${campaign.name}": errore Facebook`)
        }
      }

      return NextResponse.json({ success: true, message: results.join("\n") })
    }

    if (action === "update_budget") {
      const campaignName = params?.campaignName
      const newBudget = params?.budget

      if (!campaignName || !newBudget) return NextResponse.json({ success: false, message: "Nome campagna e budget richiesti" })

      let { data: campaign } = await serviceClient
        .from("campaigns")
        .select("*, fb_ad_account:fb_ad_accounts(access_token)")
        .ilike("name", `%${campaignName}%`)
        .eq("status", "ACTIVE")
        .limit(1)
        .single()

      if (!campaign) {
        const fallback = await serviceClient
          .from("campaigns")
          .select("*, fb_ad_account:fb_ad_accounts(access_token)")
          .ilike("name", `%${campaignName}%`)
          .limit(1)
          .single()
        campaign = fallback.data
      }

      if (!campaign) return NextResponse.json({ success: false, message: `Campagna "${campaignName}" non trovata` })

      const token = (campaign.fb_ad_account as any)?.access_token
      if (!token) return NextResponse.json({ success: false, message: "Token mancante" })

      const budgetCents = Math.round(Number(newBudget) * 100)
      const fbCampaignId = campaign.fb_campaign_id

      const beforeRes = await fetch(
        `https://graph.facebook.com/v21.0/${fbCampaignId}?fields=daily_budget,lifetime_budget,name,budget_rebalance_flag&access_token=${encodeURIComponent(token)}`
      )
      const beforeData = await beforeRes.json().catch(() => null)
      const budgetBefore = beforeData?.daily_budget ? Number(beforeData.daily_budget) : null

      const updateRes = await fetch(
        `https://graph.facebook.com/v21.0/${fbCampaignId}?daily_budget=${budgetCents}&access_token=${encodeURIComponent(token)}`,
        { method: "POST" }
      )
      const updateBody = await updateRes.json().catch(() => null)

      if (!updateRes.ok || updateBody?.error) {
        return NextResponse.json({
          success: false,
          message: `Errore Facebook: ${updateBody?.error?.message || `HTTP ${updateRes.status}`}. Campaign ID: ${fbCampaignId}. Budget prima: €${budgetBefore ? budgetBefore / 100 : "?"}`,
        })
      }

      const afterRes = await fetch(
        `https://graph.facebook.com/v21.0/${fbCampaignId}?fields=daily_budget,name&access_token=${encodeURIComponent(token)}`
      )
      const afterData = await afterRes.json().catch(() => null)
      const budgetAfter = afterData?.daily_budget ? Number(afterData.daily_budget) / 100 : null

      if (budgetAfter !== null && Math.abs(budgetAfter - Number(newBudget)) < 0.01) {
        await serviceClient.from("campaigns").update({ daily_budget: budgetCents }).eq("id", campaign.id)
        return NextResponse.json({
          success: true,
          message: `Budget "${campaign.name}" aggiornato: €${budgetBefore ? budgetBefore / 100 : "?"} → €${budgetAfter}/giorno ✓`,
        })
      }

      return NextResponse.json({
        success: false,
        message: `ATTENZIONE: Facebook ha risposto OK ma il budget NON è cambiato! Campaign ID: ${fbCampaignId}, Budget prima: €${budgetBefore ? budgetBefore / 100 : "?"}, Budget dopo: €${budgetAfter ?? "?"}, Risposta FB: ${JSON.stringify(updateBody)}`,
      })
    }

    if (action === "sync_campaigns") {
      const { data: accounts } = isAdmin
        ? await serviceClient.from("fb_ad_accounts").select("id").eq("status", "active")
        : await serviceClient.from("user_account_assignments").select("fb_ad_account_id").eq("user_id", user.id)

      const ids = isAdmin ? (accounts || []).map((a: any) => a.id) : (accounts || []).map((a: any) => a.fb_ad_account_id)
      let total = 0

      for (const id of ids) {
        try {
          const res = await fetch(new URL("/api/facebook/sync", request.url).toString(), {
            method: "POST",
            headers: { "Content-Type": "application/json", cookie: request.headers.get("cookie") || "" },
            body: JSON.stringify({ accountId: id }),
          })
          const data = await res.json()
          if (data.results) total += data.results.campaigns
        } catch { /* skip */ }
      }

      return NextResponse.json({ success: true, message: `Sincronizzazione completata: ${total} campagne aggiornate da ${ids.length} account` })
    }

    if (action === "get_campaign_details") {
      const campaignName = params?.campaignName
      if (!campaignName) return NextResponse.json({ success: false, message: "Nome campagna richiesto" })

      let { data: campaign } = await serviceClient.from("campaigns").select("*").ilike("name", `%${campaignName}%`).eq("status", "ACTIVE").limit(1).single()
      if (!campaign) {
        const fb = await serviceClient.from("campaigns").select("*").ilike("name", `%${campaignName}%`).limit(1).single()
        campaign = fb.data
      }
      if (!campaign) return NextResponse.json({ success: false, message: `Campagna "${campaignName}" non trovata` })

      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
      const { data: insights } = await serviceClient.from("campaign_insights").select("*").eq("campaign_id", campaign.id).gte("date", weekAgo).order("date")

      return NextResponse.json({
        success: true,
        campaign,
        insights: insights || [],
        message: `Dettagli campagna "${campaign.name}" caricati`,
      })
    }

    if (action === "sync_traffic_manager") {
      const { data: managers } = await serviceClient.from("traffic_managers").select("*")
      if (!managers || managers.length === 0) return NextResponse.json({ success: false, message: "Nessun Traffic Manager collegato" })

      const today = new Date().toISOString().split("T")[0]
      const monthStart = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`
      const results: string[] = []

      for (const m of managers) {
        try {
          const base = (m.api_base_url || "").replace(/\/$/, "")
          const apiUrl = `${base}/approvalRate/${monthStart}/${today}`
          const headers: Record<string, string> = { "Accept": "application/json" }
          if (m.api_key) headers["x-api-key"] = m.api_key
          if (m.api_secret) headers["x-user-id"] = m.api_secret

          const res = await fetch(apiUrl, { headers })
          if (res.ok) {
            const apiData = await res.json()
            const records = Array.isArray(apiData) ? apiData : apiData?.data || [apiData]
            const safeNum = (v: any) => { const n = Number(v); return isNaN(n) ? 0 : n }
            let totalLeads = 0, totalConfirmed = 0, totalCanceled = 0, totalPending = 0, totalApproved = 0, totalRevenue = 0

            for (const r of records) {
              const l = r.leads || {}
              const c = r.conversions || {}
              const conf = safeNum(l.confirmed?.total)
              const canc = safeNum(l.canceled?.total)
              const pend = safeNum(c.pending?.total ?? l.to_call_back?.total)
              const appr = safeNum(c.approved?.total)
              const doub = safeNum(l.double)
              const trash = safeNum(l.trash)
              totalLeads += conf + canc + pend + doub + trash
              totalConfirmed += conf
              totalCanceled += canc
              totalPending += pend
              totalApproved += appr
              totalRevenue += safeNum(l.confirmed?.payout) + safeNum(c.approved?.payout)
            }

            await serviceClient.from("traffic_manager_data").delete().eq("traffic_manager_id", m.id)
            await serviceClient.from("traffic_manager_data").insert({
              traffic_manager_id: m.id,
              date: today,
              total_conversions: totalLeads,
              approved_conversions: totalApproved > 0 ? totalApproved : totalConfirmed,
              rejected_conversions: totalCanceled,
              pending_conversions: totalPending,
              approval_rate: totalLeads > 0 ? Math.round(((totalApproved > 0 ? totalApproved : totalConfirmed) / totalLeads) * 10000) / 100 : 0,
              revenue: totalRevenue,
              raw_data: apiData,
            })
            await serviceClient.from("traffic_managers").update({ last_synced_at: new Date().toISOString() }).eq("id", m.id)
            results.push(`"${m.name}": ${totalLeads} lead, ${totalConfirmed} confermate, approval ${totalLeads > 0 ? Math.round(((totalApproved > 0 ? totalApproved : totalConfirmed) / totalLeads) * 100) : 0}%`)
          } else {
            results.push(`"${m.name}": errore API ${res.status}`)
          }
        } catch (e) {
          results.push(`"${m.name}": errore connessione`)
        }
      }

      return NextResponse.json({ success: true, message: `Traffic Manager sincronizzato:\n${results.join("\n")}` })
    }

    if (action === "search_offers" || action === "fetch_offers") {
      const { data: managers } = await serviceClient.from("traffic_managers").select("*")
      if (!managers || managers.length === 0) return NextResponse.json({ success: false, message: "Nessun Traffic Manager collegato" })

      const searchId = params?.offerId
      const searchTerm = params?.search

      const allOffers: any[] = []
      for (const m of managers) {
        if (!m.api_base_url || !m.api_key) continue
        try {
          const base = (m.api_base_url || "").replace(/\/$/, "")
          const headers: Record<string, string> = { "Accept": "application/json" }
          if (m.api_key) headers["x-api-key"] = m.api_key
          if (m.api_secret) headers["x-user-id"] = m.api_secret
          const res = await fetch(`${base}/offers`, { headers })
          if (res.ok) {
            const data = await res.json()
            const offers = Array.isArray(data) ? data : data?.data || data?.offers || []
            for (const o of offers) {
              const offer = {
                tm: m.name,
                id: o.id || o.offer_id,
                nome: o.name || o.offer_name,
                stato: o.status,
                paese: o.country || o.geo || o.countries,
                payout: o.payout,
                verticale: o.vertical || o.category,
                descrizione: o.description || o.short_description || "",
                prezzo: o.price || o.user_price || o.product_price || "",
                url: o.url || o.preview_url || "",
                immagine: o.image || o.thumbnail || o.logo || "",
                valuta: o.currency || "",
              }
              if (searchId && String(offer.id) !== String(searchId)) continue
              if (searchTerm && !offer.nome?.toLowerCase().includes(searchTerm.toLowerCase()) && String(offer.id) !== String(searchTerm)) continue
              allOffers.push(offer)
            }
          }
        } catch { /* skip */ }
      }

      if (allOffers.length === 0) {
        return NextResponse.json({ success: true, message: searchId ? `Offerta #${searchId} non trovata nel catalogo` : "Nessuna offerta trovata" })
      }

      if (searchId || (searchTerm && allOffers.length <= 5)) {
        const o = allOffers[0]
        return NextResponse.json({
          success: true,
          message: `Offerta trovata: "${o.nome}" (ID: ${o.id}, Paese: ${o.paese}, Payout: €${o.payout}, Verticale: ${o.verticale}${o.prezzo ? `, Prezzo: ${o.prezzo}` : ""})`,
          type: "offer_detail",
          offers: allOffers,
        })
      }

      return NextResponse.json({
        success: true,
        message: `Trovate ${allOffers.length} offerte dal network`,
        type: "offers",
        offers: allOffers,
      })
    }

    if (action === "publish_wordpress") {
      const wpSiteId = params?.wpSiteId ?? 0
      const pageTitle = params?.pageTitle || "Landing Page"
      const pageType = params?.pageType || "landing"

      const { data: userSettings } = await serviceClient
        .from("user_settings")
        .select("wordpress_sites")
        .eq("user_id", user.id)
        .single()

      const sites = userSettings?.wordpress_sites
      if (!sites || !Array.isArray(sites) || sites.length === 0) {
        return NextResponse.json({ success: false, message: "Nessun sito WordPress configurato. Vai in Impostazioni per aggiungerne uno." })
      }

      const site = sites[Number(wpSiteId)] || sites[0]
      if (!site?.domain || !site?.username || !site?.app_password) {
        return NextResponse.json({ success: false, message: `Sito WordPress "${site?.name || wpSiteId}" non configurato completamente (manca dominio, username o app password)` })
      }

      let htmlContent = params?.htmlContent
      if (!htmlContent) return NextResponse.json({ success: false, message: "Nessun contenuto HTML da pubblicare" })

      const offerUrl = params?.offerUrl
      const thankPageUrl = params?.thankPageUrl

      if (offerUrl) {
        htmlContent = htmlContent.replace(
          /action="[^"]*"/g,
          `action="${offerUrl}"`
        )
        htmlContent = htmlContent.replace(
          /href='#'/g,
          `href='${offerUrl}'`
        )
      }
      if (thankPageUrl) {
        htmlContent = htmlContent.replace(
          /<\/form>/g,
          `<input type="hidden" name="redirect_url" value="${thankPageUrl}" /></form>`
        )
      }

      const domain = site.domain.replace(/\/$/, "")
      const auth = Buffer.from(`${site.username}:${site.app_password}`).toString("base64")

      const slug = pageTitle.toLowerCase()
        .replace(/[àáâãäå]/g, "a").replace(/[èéêë]/g, "e").replace(/[ìíîï]/g, "i")
        .replace(/[òóôõö]/g, "o").replace(/[ùúûü]/g, "u")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

      try {
        const wpRes = await fetch(`${domain}/wp-json/wp/v2/pages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Basic ${auth}`,
          },
          body: JSON.stringify({
            title: pageTitle,
            slug,
            content: htmlContent,
            status: "publish",
            template: "elementor_canvas",
          }),
        })

        const wpData = await wpRes.json()

        if (!wpRes.ok) {
          return NextResponse.json({
            success: false,
            message: `Errore WordPress: ${wpData?.message || wpRes.status}. Verifica username e Application Password nelle Impostazioni.`,
          })
        }

        const pageUrl = wpData.link || `${domain}/?p=${wpData.id}`
        const extras = []
        if (offerUrl) extras.push(`Form → ${offerUrl}`)
        if (thankPageUrl) extras.push(`Thank Page → ${thankPageUrl}`)

        return NextResponse.json({
          success: true,
          message: `${pageType === "thank_page" ? "Thank Page" : "Landing Page"} "${pageTitle}" pubblicata su ${site.name}!\nURL: ${pageUrl}\nID Pagina: ${wpData.id}${extras.length ? "\n" + extras.join("\n") : ""}`,
          pageId: wpData.id,
          pageUrl,
        })
      } catch (err: any) {
        return NextResponse.json({ success: false, message: `Errore connessione WordPress: ${err.message}` })
      }
    }

    if (action === "change_lp_offer") {
      const wpSiteId = params?.wpSiteId ?? 0
      const pageId = params?.pageId
      const newOfferUrl = params?.newOfferUrl
      const newThankPageUrl = params?.newThankPageUrl
      let newContent = params?.htmlContent

      if (!pageId) return NextResponse.json({ success: false, message: "ID pagina WordPress richiesto" })

      const { data: userSettings } = await serviceClient
        .from("user_settings")
        .select("wordpress_sites")
        .eq("user_id", user.id)
        .single()

      const sites = userSettings?.wordpress_sites
      if (!sites || !Array.isArray(sites) || sites.length === 0) {
        return NextResponse.json({ success: false, message: "Nessun sito WordPress configurato" })
      }

      const site = sites[Number(wpSiteId)] || sites[0]
      const domain = site.domain.replace(/\/$/, "")
      const auth = Buffer.from(`${site.username}:${site.app_password}`).toString("base64")

      try {
        if (!newContent && (newOfferUrl || newThankPageUrl)) {
          const getRes = await fetch(`${domain}/wp-json/wp/v2/pages/${pageId}`, {
            headers: { "Authorization": `Basic ${auth}` },
          })
          if (getRes.ok) {
            const pageData = await getRes.json()
            newContent = pageData.content?.rendered || ""
          }
        }

        if (newContent && newOfferUrl) {
          newContent = newContent.replace(/action="[^"]*"/g, `action="${newOfferUrl}"`)
          newContent = newContent.replace(/href='#'/g, `href='${newOfferUrl}'`)
        }
        if (newContent && newThankPageUrl) {
          newContent = newContent.replace(
            /name="redirect_url" value="[^"]*"/g,
            `name="redirect_url" value="${newThankPageUrl}"`
          )
        }

        const wpRes = await fetch(`${domain}/wp-json/wp/v2/pages/${pageId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Basic ${auth}`,
          },
          body: JSON.stringify({ content: newContent || undefined }),
        })

        const wpData = await wpRes.json()
        if (!wpRes.ok) {
          return NextResponse.json({ success: false, message: `Errore WordPress: ${wpData?.message || wpRes.status}` })
        }

        const changes = []
        if (newOfferUrl) changes.push(`Offerta → ${newOfferUrl}`)
        if (newThankPageUrl) changes.push(`Thank Page → ${newThankPageUrl}`)
        if (newContent && !newOfferUrl && !newThankPageUrl) changes.push("Contenuto aggiornato")

        return NextResponse.json({
          success: true,
          message: `Pagina ${pageId} aggiornata su ${site.name}.\n${changes.join("\n")}`,
        })
      } catch (err: any) {
        return NextResponse.json({ success: false, message: `Errore: ${err.message}` })
      }
    }

    // ===================================================================
    // FACEBOOK ADS: DUPLICATE CAMPAIGN
    // ===================================================================
    if (action === "duplicate_campaign") {
      const campaignName = params?.campaignName
      const newName = params?.newName
      const newBudget = params?.budget
      const newStatus = params?.status || "PAUSED"

      if (!campaignName) return NextResponse.json({ success: false, message: "Nome campagna richiesto" })

      let { data: campaign } = await serviceClient
        .from("campaigns").select("*, fb_ad_account:fb_ad_accounts(access_token, account_id)")
        .ilike("name", `%${campaignName}%`).limit(1).single()
      if (!campaign) return NextResponse.json({ success: false, message: `Campagna "${campaignName}" non trovata` })

      const token = (campaign.fb_ad_account as any)?.access_token
      if (!token) return NextResponse.json({ success: false, message: "Token mancante" })

      try {
        const copyRes = await fetch(`https://graph.facebook.com/v21.0/${campaign.fb_campaign_id}/copies`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: token,
            ...(newStatus === "PAUSED" ? { status_option: "PAUSED" } : {}),
          }),
        })
        const copyData = await copyRes.json()
        if (!copyRes.ok || copyData.error) {
          return NextResponse.json({ success: false, message: `Errore duplicazione: ${copyData?.error?.message || copyRes.status}` })
        }

        const newCampaignId = copyData.copied_campaign_id || copyData.campaign_id_new || copyData.id
        if (!newCampaignId) return NextResponse.json({ success: false, message: `Duplicazione avviata ma ID non restituito. Risposta: ${JSON.stringify(copyData)}` })

        const updates: Record<string, string> = { access_token: token }
        if (newName) updates.name = newName
        if (newBudget) updates.daily_budget = String(Math.round(Number(newBudget) * 100))

        if (newName || newBudget) {
          await fetch(`https://graph.facebook.com/v21.0/${newCampaignId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates),
          })
        }

        const verifyRes = await fetch(`https://graph.facebook.com/v21.0/${newCampaignId}?fields=id,name,status,daily_budget&access_token=${encodeURIComponent(token)}`)
        const verifyData = await verifyRes.json()

        await serviceClient.from("campaigns").insert({
          fb_campaign_id: newCampaignId,
          fb_ad_account_id: campaign.fb_ad_account_id,
          name: verifyData.name || newName || `${campaign.name} - Copy`,
          status: verifyData.status || newStatus,
          objective: campaign.objective,
          daily_budget: verifyData.daily_budget ? Number(verifyData.daily_budget) : campaign.daily_budget,
          bid_strategy: campaign.bid_strategy,
        })

        return NextResponse.json({
          success: true,
          message: `Campagna duplicata! "${campaign.name}" → "${verifyData.name || newName || campaign.name + ' - Copy'}"\nNuovo ID: ${newCampaignId}\nStato: ${verifyData.status || newStatus}\nBudget: €${verifyData.daily_budget ? Number(verifyData.daily_budget) / 100 : "invariato"}/giorno`,
          newCampaignId,
        })
      } catch (err: any) {
        return NextResponse.json({ success: false, message: `Errore: ${err.message}` })
      }
    }

    // ===================================================================
    // FACEBOOK ADS: CREATE CAMPAIGN
    // ===================================================================
    if (action === "create_campaign") {
      const accountName = params?.accountName
      const name = params?.name
      const objective = params?.objective || "OUTCOME_LEADS"
      const dailyBudget = params?.dailyBudget || params?.budget
      const bidStrategy = params?.bidStrategy || "LOWEST_COST_WITHOUT_CAP"
      const status = params?.status || "PAUSED"

      if (!name) return NextResponse.json({ success: false, message: "Nome campagna richiesto" })

      let account: any = null
      if (accountName) {
        const { data } = await serviceClient.from("fb_ad_accounts").select("*").ilike("name", `%${accountName}%`).eq("status", "active").limit(1).single()
        account = data
      }
      if (!account) {
        const query = isAdmin
          ? serviceClient.from("fb_ad_accounts").select("*").eq("status", "active").limit(1).single()
          : serviceClient.from("user_account_assignments").select("fb_ad_account_id").eq("user_id", user.id).limit(1).single()
        const { data } = await query
        if (data && "fb_ad_account_id" in data) {
          const { data: acc } = await serviceClient.from("fb_ad_accounts").select("*").eq("id", data.fb_ad_account_id).single()
          account = acc
        } else {
          account = data
        }
      }
      if (!account?.access_token) return NextResponse.json({ success: false, message: "Nessun account Facebook trovato o token mancante" })

      try {
        const fbParams: Record<string, string> = {
          name,
          objective,
          status,
          special_ad_categories: JSON.stringify([]),
          access_token: account.access_token,
        }
        if (dailyBudget) fbParams.daily_budget = String(Math.round(Number(dailyBudget) * 100))
        if (bidStrategy) fbParams.bid_strategy = bidStrategy

        const res = await fetch(`https://graph.facebook.com/v21.0/${account.account_id}/campaigns`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fbParams),
        })
        const data = await res.json()

        if (!res.ok || data.error) {
          return NextResponse.json({ success: false, message: `Errore Facebook: ${data?.error?.message || res.status}` })
        }

        await serviceClient.from("campaigns").insert({
          fb_campaign_id: data.id,
          fb_ad_account_id: account.id,
          name,
          status,
          objective,
          daily_budget: dailyBudget ? Math.round(Number(dailyBudget) * 100) : null,
          bid_strategy: bidStrategy,
        })

        return NextResponse.json({
          success: true,
          message: `Campagna "${name}" creata su ${account.name}!\nID: ${data.id}\nObiettivo: ${objective}\nBudget: €${dailyBudget || "non impostato"}/giorno\nStato: ${status}\nBid Strategy: ${bidStrategy}`,
          campaignId: data.id,
        })
      } catch (err: any) {
        return NextResponse.json({ success: false, message: `Errore: ${err.message}` })
      }
    }

    // ===================================================================
    // FACEBOOK ADS: CREATE ADSET
    // ===================================================================
    if (action === "create_adset") {
      const campaignName = params?.campaignName
      const campaignId = params?.campaignId
      const name = params?.name
      const dailyBudget = params?.dailyBudget || params?.budget
      const optimizationGoal = params?.optimizationGoal || "OFFSITE_CONVERSIONS"
      const targeting = params?.targeting || {}
      const status = params?.status || "PAUSED"
      const pixelId = params?.pixelId
      const startTime = params?.startTime
      const bidAmount = params?.bidAmount

      if (!name) return NextResponse.json({ success: false, message: "Nome adset richiesto" })

      let campaign: any = null
      let fbCampaignId = campaignId
      if (campaignName && !fbCampaignId) {
        const { data } = await serviceClient.from("campaigns").select("*, fb_ad_account:fb_ad_accounts(access_token, account_id)").ilike("name", `%${campaignName}%`).limit(1).single()
        campaign = data
        fbCampaignId = data?.fb_campaign_id
      } else if (fbCampaignId) {
        const { data } = await serviceClient.from("campaigns").select("*, fb_ad_account:fb_ad_accounts(access_token, account_id)").eq("fb_campaign_id", fbCampaignId).limit(1).single()
        campaign = data
      }
      if (!campaign) return NextResponse.json({ success: false, message: "Campagna non trovata" })

      const token = (campaign.fb_ad_account as any)?.access_token
      const accountId = (campaign.fb_ad_account as any)?.account_id
      if (!token || !accountId) return NextResponse.json({ success: false, message: "Token o account ID mancante" })

      try {
        const fbParams: any = {
          name,
          campaign_id: fbCampaignId,
          optimization_goal: optimizationGoal,
          billing_event: "IMPRESSIONS",
          status,
          targeting: typeof targeting === "string" ? targeting : JSON.stringify(targeting),
          access_token: token,
        }
        if (dailyBudget) fbParams.daily_budget = String(Math.round(Number(dailyBudget) * 100))
        if (bidAmount) fbParams.bid_amount = String(Math.round(Number(bidAmount) * 100))
        if (pixelId) fbParams.promoted_object = JSON.stringify({ pixel_id: pixelId, custom_event_type: "LEAD" })
        if (startTime) fbParams.start_time = startTime

        const res = await fetch(`https://graph.facebook.com/v21.0/${accountId}/adsets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fbParams),
        })
        const data = await res.json()

        if (!res.ok || data.error) {
          return NextResponse.json({ success: false, message: `Errore Facebook: ${data?.error?.message || res.status}` })
        }

        return NextResponse.json({
          success: true,
          message: `Adset "${name}" creato nella campagna "${campaign.name}"!\nID: ${data.id}\nBudget: €${dailyBudget || "CBO"}/giorno\nOttimizzazione: ${optimizationGoal}\nStato: ${status}`,
          adsetId: data.id,
        })
      } catch (err: any) {
        return NextResponse.json({ success: false, message: `Errore: ${err.message}` })
      }
    }

    // ===================================================================
    // FACEBOOK ADS: CREATE AD WITH CREATIVE
    // ===================================================================
    if (action === "create_ad") {
      const adsetName = params?.adsetName
      const adsetId = params?.adsetId
      const name = params?.name || "Ad"
      const pageId = params?.pageId
      const link = params?.link
      const message = params?.primaryText || params?.message
      const headline = params?.headline
      const description = params?.description
      const imageUrl = params?.imageUrl
      const videoId = params?.videoId
      const callToAction = params?.callToAction || "LEARN_MORE"
      const status = params?.status || "PAUSED"

      let resolvedAdsetId = adsetId
      let token: string | null = null
      let accountId: string | null = null

      if (adsetName && !resolvedAdsetId) {
        const { data: campaigns } = await serviceClient.from("campaigns")
          .select("fb_campaign_id, fb_ad_account:fb_ad_accounts(access_token, account_id)").limit(50)
        for (const c of campaigns || []) {
          try {
            const t = (c.fb_ad_account as any)?.access_token
            if (!t) continue
            const res = await fetch(`https://graph.facebook.com/v21.0/${c.fb_campaign_id}/adsets?fields=id,name&access_token=${encodeURIComponent(t)}&limit=100`)
            const d = await res.json()
            const found = (d.data || []).find((a: any) => a.name?.toLowerCase().includes(adsetName.toLowerCase()))
            if (found) {
              resolvedAdsetId = found.id
              token = t
              accountId = (c.fb_ad_account as any)?.account_id
              break
            }
          } catch { /* skip */ }
        }
      } else if (resolvedAdsetId) {
        const { data: accounts } = await serviceClient.from("fb_ad_accounts").select("access_token, account_id").eq("status", "active").limit(1).single()
        token = accounts?.access_token || null
        accountId = accounts?.account_id || null
      }

      if (!resolvedAdsetId || !token || !accountId) return NextResponse.json({ success: false, message: "Adset non trovato o token mancante" })
      if (!pageId) return NextResponse.json({ success: false, message: "Page ID Facebook richiesto (la pagina da cui pubblicare l'ad)" })

      try {
        const objectStorySpec: any = { page_id: pageId }
        if (videoId) {
          objectStorySpec.video_data = {
            video_id: videoId, title: headline || "", message: message || "",
            link_description: description || "",
            call_to_action: { type: callToAction, value: { link: link || "" } },
            ...(imageUrl ? { image_url: imageUrl } : {}),
          }
        } else {
          objectStorySpec.link_data = {
            link: link || "", message: message || "", name: headline || "",
            description: description || "",
            call_to_action: { type: callToAction },
            ...(imageUrl ? { picture: imageUrl } : {}),
          }
        }

        const creativeRes = await fetch(`https://graph.facebook.com/v21.0/${accountId}/adcreatives`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `Creative - ${name}`,
            object_story_spec: objectStorySpec,
            access_token: token,
          }),
        })
        const creativeData = await creativeRes.json()
        if (!creativeRes.ok || creativeData.error) {
          return NextResponse.json({ success: false, message: `Errore creazione creative: ${creativeData?.error?.message || creativeRes.status}` })
        }

        const adRes = await fetch(`https://graph.facebook.com/v21.0/${accountId}/ads`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            adset_id: resolvedAdsetId,
            creative: { creative_id: creativeData.id },
            status,
            access_token: token,
          }),
        })
        const adData = await adRes.json()
        if (!adRes.ok || adData.error) {
          return NextResponse.json({ success: false, message: `Errore creazione ad: ${adData?.error?.message || adRes.status}` })
        }

        return NextResponse.json({
          success: true,
          message: `Ad "${name}" creato!\nAd ID: ${adData.id}\nCreative ID: ${creativeData.id}\nAdset: ${resolvedAdsetId}\nStato: ${status}`,
          adId: adData.id,
          creativeId: creativeData.id,
        })
      } catch (err: any) {
        return NextResponse.json({ success: false, message: `Errore: ${err.message}` })
      }
    }

    // ===================================================================
    // FACEBOOK ADS: UPDATE ADSET (targeting, budget, bid, status)
    // ===================================================================
    if (action === "update_adset") {
      const adsetId = params?.adsetId
      const adsetName = params?.adsetName
      const updates = params?.updates || {}

      let resolvedId = adsetId
      let token: string | null = null

      if (adsetName && !resolvedId) {
        const { data: campaigns } = await serviceClient.from("campaigns")
          .select("fb_campaign_id, fb_ad_account:fb_ad_accounts(access_token)").limit(50)
        for (const c of campaigns || []) {
          try {
            const t = (c.fb_ad_account as any)?.access_token
            if (!t) continue
            const res = await fetch(`https://graph.facebook.com/v21.0/${c.fb_campaign_id}/adsets?fields=id,name&access_token=${encodeURIComponent(t)}&limit=100`)
            const d = await res.json()
            const found = (d.data || []).find((a: any) => a.name?.toLowerCase().includes(adsetName.toLowerCase()))
            if (found) { resolvedId = found.id; token = t; break }
          } catch { /* skip */ }
        }
      } else if (resolvedId) {
        const { data } = await serviceClient.from("fb_ad_accounts").select("access_token").eq("status", "active").limit(1).single()
        token = data?.access_token || null
      }

      if (!resolvedId || !token) return NextResponse.json({ success: false, message: "Adset non trovato" })

      try {
        const fbParams: any = { access_token: token }
        if (updates.name) fbParams.name = updates.name
        if (updates.status) fbParams.status = updates.status
        if (updates.dailyBudget) fbParams.daily_budget = String(Math.round(Number(updates.dailyBudget) * 100))
        if (updates.bidAmount) fbParams.bid_amount = String(Math.round(Number(updates.bidAmount) * 100))
        if (updates.targeting) fbParams.targeting = typeof updates.targeting === "string" ? updates.targeting : JSON.stringify(updates.targeting)
        if (updates.optimizationGoal) fbParams.optimization_goal = updates.optimizationGoal
        if (updates.startTime) fbParams.start_time = updates.startTime
        if (updates.endTime) fbParams.end_time = updates.endTime

        const res = await fetch(`https://graph.facebook.com/v21.0/${resolvedId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fbParams),
        })
        const data = await res.json()
        if (!res.ok || data.error) {
          return NextResponse.json({ success: false, message: `Errore Facebook: ${data?.error?.message || res.status}` })
        }

        const changeList = Object.entries(updates).map(([k, v]) => `${k}: ${v}`).join(", ")
        return NextResponse.json({ success: true, message: `Adset ${resolvedId} aggiornato: ${changeList}` })
      } catch (err: any) {
        return NextResponse.json({ success: false, message: `Errore: ${err.message}` })
      }
    }

    // ===================================================================
    // FACEBOOK ADS: UPDATE AD (status, creative)
    // ===================================================================
    if (action === "update_ad") {
      const adId = params?.adId
      const updates = params?.updates || {}

      if (!adId) return NextResponse.json({ success: false, message: "Ad ID richiesto" })

      const { data } = await serviceClient.from("fb_ad_accounts").select("access_token").eq("status", "active").limit(1).single()
      const token = data?.access_token
      if (!token) return NextResponse.json({ success: false, message: "Token mancante" })

      try {
        const fbParams: any = { access_token: token }
        if (updates.name) fbParams.name = updates.name
        if (updates.status) fbParams.status = updates.status
        if (updates.creativeId) fbParams.creative = JSON.stringify({ creative_id: updates.creativeId })

        const res = await fetch(`https://graph.facebook.com/v21.0/${adId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fbParams),
        })
        const result = await res.json()
        if (!res.ok || result.error) {
          return NextResponse.json({ success: false, message: `Errore Facebook: ${result?.error?.message || res.status}` })
        }

        return NextResponse.json({ success: true, message: `Ad ${adId} aggiornato: ${Object.entries(updates).map(([k, v]) => `${k}: ${v}`).join(", ")}` })
      } catch (err: any) {
        return NextResponse.json({ success: false, message: `Errore: ${err.message}` })
      }
    }

    // ===================================================================
    // FACEBOOK ADS: GET CAMPAIGN STRUCTURE (adsets + ads)
    // ===================================================================
    if (action === "get_campaign_structure") {
      const campaignName = params?.campaignName
      if (!campaignName) return NextResponse.json({ success: false, message: "Nome campagna richiesto" })

      let { data: campaign } = await serviceClient.from("campaigns")
        .select("*, fb_ad_account:fb_ad_accounts(access_token)").ilike("name", `%${campaignName}%`).limit(1).single()
      if (!campaign) return NextResponse.json({ success: false, message: `Campagna "${campaignName}" non trovata` })

      const token = (campaign.fb_ad_account as any)?.access_token
      if (!token) return NextResponse.json({ success: false, message: "Token mancante" })

      try {
        const adsetsRes = await fetch(`https://graph.facebook.com/v21.0/${campaign.fb_campaign_id}/adsets?fields=id,name,status,daily_budget,lifetime_budget,bid_amount,optimization_goal,targeting&limit=100&access_token=${encodeURIComponent(token)}`)
        const adsetsData = await adsetsRes.json()
        const adsets = adsetsData.data || []

        const structure: string[] = [`**${campaign.name}** (${campaign.status})`]
        for (const adset of adsets) {
          const budget = adset.daily_budget ? `€${Number(adset.daily_budget) / 100}/day` : adset.lifetime_budget ? `€${Number(adset.lifetime_budget) / 100} lifetime` : "CBO"
          structure.push(`\n  📁 ${adset.name} [${adset.status}] - ${budget}`)

          const targeting = adset.targeting || {}
          if (targeting.geo_locations?.countries) structure.push(`     GEO: ${targeting.geo_locations.countries.join(", ")}`)
          if (targeting.age_min || targeting.age_max) structure.push(`     Età: ${targeting.age_min || 18}-${targeting.age_max || 65}`)

          const adsRes = await fetch(`https://graph.facebook.com/v21.0/${adset.id}/ads?fields=id,name,status&limit=50&access_token=${encodeURIComponent(token)}`)
          const adsData = await adsRes.json()
          for (const ad of adsData.data || []) {
            structure.push(`     📄 ${ad.name} [${ad.status}]`)
          }
        }

        return NextResponse.json({
          success: true,
          message: `Struttura campagna:\n${structure.join("\n")}`,
          structure: { campaign, adsets },
        })
      } catch (err: any) {
        return NextResponse.json({ success: false, message: `Errore: ${err.message}` })
      }
    }

    // ===================================================================
    // FACEBOOK ADS: SEARCH INTERESTS
    // ===================================================================
    if (action === "search_interests") {
      const query = params?.query
      if (!query) return NextResponse.json({ success: false, message: "Query ricerca richiesta" })

      const { data: account } = await serviceClient.from("fb_ad_accounts").select("access_token").eq("status", "active").limit(1).single()
      if (!account?.access_token) return NextResponse.json({ success: false, message: "Token mancante" })

      try {
        const res = await fetch(`https://graph.facebook.com/v21.0/search?type=adinterest&q=${encodeURIComponent(query)}&limit=20&access_token=${encodeURIComponent(account.access_token)}`)
        const data = await res.json()
        const interests = (data.data || []).map((i: any) => `${i.name} (audience: ${i.audience_size_lower_bound || "?"}-${i.audience_size_upper_bound || "?"})`)

        return NextResponse.json({
          success: true,
          message: `Interessi trovati per "${query}":\n${interests.join("\n") || "Nessun risultato"}`,
          interests: data.data || [],
        })
      } catch (err: any) {
        return NextResponse.json({ success: false, message: `Errore: ${err.message}` })
      }
    }

    return NextResponse.json({ success: false, message: `Azione "${action}" non supportata` })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error" }, { status: 500 })
  }
}
