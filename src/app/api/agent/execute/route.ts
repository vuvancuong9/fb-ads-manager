import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

export const maxDuration = 60

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
        ? await serviceClient.from("fb_ad_accounts").select("*").eq("status", "active")
        : await (async () => {
            const { data: assignments } = await serviceClient.from("user_account_assignments").select("fb_ad_account_id").eq("user_id", user.id)
            if (!assignments?.length) return { data: [] }
            const ids = assignments.map((a: any) => a.fb_ad_account_id)
            return serviceClient.from("fb_ad_accounts").select("*").in("id", ids)
          })()

      if (!accounts?.length) return NextResponse.json({ success: false, message: "Nessun account Facebook trovato" })

      let total = 0
      const details: string[] = []

      for (const account of accounts) {
        try {
          const fbRes = await fetch(`https://graph.facebook.com/v21.0/${account.account_id}/campaigns?fields=id,name,status,objective,daily_budget,lifetime_budget,bid_strategy,start_time,stop_time,created_time,updated_time&limit=100&access_token=${encodeURIComponent(account.access_token)}`)
          const fbData = await fbRes.json()
          if (fbData.error) { details.push(`${account.name}: errore — ${fbData.error.message}`); continue }
          for (const c of fbData.data || []) {
            await serviceClient.from("campaigns").upsert({
              fb_campaign_id: c.id,
              fb_ad_account_id: account.id,
              name: c.name,
              status: c.status,
              objective: c.objective,
              daily_budget: c.daily_budget ? parseInt(c.daily_budget) : null,
              lifetime_budget: c.lifetime_budget ? parseInt(c.lifetime_budget) : null,
              bid_strategy: c.bid_strategy,
              start_time: c.start_time,
              stop_time: c.stop_time,
              created_time: c.created_time,
              updated_time: c.updated_time,
              last_synced_at: new Date().toISOString(),
            }, { onConflict: "fb_campaign_id,fb_ad_account_id" })
            total++
          }
          details.push(`${account.name}: ${fbData.data?.length || 0} campagne`)
        } catch (e: any) { details.push(`${account.name}: errore — ${e.message}`) }
      }

      return NextResponse.json({ success: true, message: `Sincronizzazione completata: ${total} campagne da ${accounts.length} account\n${details.join("\n")}` })
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
      const campaignId = params?.campaignId
      const newName = params?.newName
      const newBudget = params?.budget
      const newStatus = params?.status || "PAUSED"

      if (!campaignName && !campaignId) return NextResponse.json({ success: false, message: "Nome o ID campagna richiesto" })

      // STEP 1: Trova la campagna e il token — prima in Supabase, poi direttamente su Facebook
      let fbCampaignId: string | null = null
      let token: string | null = null
      let accountDbId: string | null = null
      let origName = campaignName || ""

      if (campaignId) {
        // ID diretto passato
        const { data: c } = await serviceClient.from("campaigns").select("*, fb_ad_account:fb_ad_accounts(access_token, account_id)").eq("fb_campaign_id", campaignId).limit(1).single()
        if (c) {
          fbCampaignId = c.fb_campaign_id
          token = (c.fb_ad_account as any)?.access_token
          accountDbId = c.fb_ad_account_id
          origName = c.name
        }
      }

      if (!fbCampaignId && campaignName) {
        const { data: c } = await serviceClient.from("campaigns").select("*, fb_ad_account:fb_ad_accounts(access_token, account_id)").ilike("name", `%${campaignName}%`).limit(1).single()
        if (c) {
          fbCampaignId = c.fb_campaign_id
          token = (c.fb_ad_account as any)?.access_token
          accountDbId = c.fb_ad_account_id
          origName = c.name
        }
      }

      // Fallback: cerca su Facebook direttamente in tutti gli account
      if (!fbCampaignId) {
        const { data: accounts } = await serviceClient.from("fb_ad_accounts").select("*").eq("status", "active")
        for (const acc of accounts || []) {
          const searchRes = await fetch(`https://graph.facebook.com/v21.0/${acc.account_id}/campaigns?fields=id,name&filtering=[{"field":"name","operator":"CONTAIN","value":"${encodeURIComponent(campaignName || "")}"}]&limit=5&access_token=${encodeURIComponent(acc.access_token)}`)
          const searchData = await searchRes.json()
          const match = (searchData.data || []).find((c: any) => c.name.toLowerCase().includes((campaignName || "").toLowerCase()))
          if (match) {
            fbCampaignId = match.id
            token = acc.access_token
            accountDbId = acc.id
            origName = match.name
            break
          }
        }
      }

      if (!fbCampaignId || !token) {
        return NextResponse.json({ success: false, message: `Campagna "${campaignName || campaignId}" non trovata né nel database né su Facebook. Campagne disponibili: usa "list_campaigns" per vedere la lista.` })
      }

      // Trova l'account_id per le chiamate che lo richiedono
      let accountId: string | null = null
      if (accountDbId) {
        const { data: acc } = await serviceClient.from("fb_ad_accounts").select("account_id").eq("id", accountDbId).single()
        accountId = acc?.account_id || null
      }

      try {
        let newCampaignId: string | null = null

        // STEP 2A: Prova deep_copy diretto (funziona se <=3 oggetti figli)
        const copyRes = await fetch(`https://graph.facebook.com/v21.0/${fbCampaignId}/copies`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: token, deep_copy: true, status_option: newStatus === "ACTIVE" ? "ACTIVE" : "PAUSED" }),
        })
        const copyData = await copyRes.json()

        if (copyRes.ok && !copyData.error && copyData.copied_campaign_id) {
          newCampaignId = copyData.copied_campaign_id
        }

        // STEP 2B: Se troppi oggetti → copia campagna vuota + copia ogni adset singolarmente
        if (!newCampaignId) {
          const errMsg = copyData?.error?.message || ""
          const isTooLarge = errMsg.includes("too large") || errMsg.includes("fewer than") || (copyData?.error?.error_subcode === 1885194)

          if (!isTooLarge) {
            return NextResponse.json({
              success: false,
              message: `Errore Facebook duplicazione "${origName}" (${fbCampaignId}):\n${errMsg}\n${copyData?.error?.error_user_msg || ""}`,
            })
          }

          // Copia campagna SENZA deep_copy (solo il contenitore)
          const shellRes = await fetch(`https://graph.facebook.com/v21.0/${fbCampaignId}/copies`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ access_token: token, deep_copy: false, status_option: "PAUSED" }),
          })
          const shellData = await shellRes.json()

          if (!shellRes.ok || shellData.error || !shellData.copied_campaign_id) {
            return NextResponse.json({
              success: false,
              message: `Errore copia campagna base: ${shellData?.error?.message || "nessun ID restituito"}`,
            })
          }
          newCampaignId = shellData.copied_campaign_id

          // Leggi gli adset originali e copiali uno per uno nella nuova campagna
          const origAdsetsRes = await fetch(`https://graph.facebook.com/v21.0/${fbCampaignId}/adsets?fields=id,name&limit=50&access_token=${encodeURIComponent(token)}`)
          const origAdsetsData = await origAdsetsRes.json()
          const origAdsets = origAdsetsData.data || []

          for (const adset of origAdsets) {
            // Livello 2: prova deep_copy sull'adset
            const adsetCopyRes = await fetch(`https://graph.facebook.com/v21.0/${adset.id}/copies`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ access_token: token, campaign_id: newCampaignId, deep_copy: true, status_option: "PAUSED" }),
            })
            const adsetCopyData = await adsetCopyRes.json()

            if (adsetCopyRes.ok && !adsetCopyData.error) continue

            // Livello 3: adset ha troppi ads → copia adset vuoto + copia ogni ad singolarmente
            const adsetShellRes = await fetch(`https://graph.facebook.com/v21.0/${adset.id}/copies`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ access_token: token, campaign_id: newCampaignId, deep_copy: false, status_option: "PAUSED" }),
            })
            const adsetShellData = await adsetShellRes.json()
            const newAdsetId = adsetShellData.copied_adset_id
            if (!newAdsetId) continue

            // Leggi gli ads originali dell'adset e copiali uno per uno
            const origAdsRes = await fetch(`https://graph.facebook.com/v21.0/${adset.id}/ads?fields=id,name&limit=100&access_token=${encodeURIComponent(token)}`)
            const origAdsData = await origAdsRes.json()
            for (const ad of origAdsData.data || []) {
              try {
                await fetch(`https://graph.facebook.com/v21.0/${ad.id}/copies`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ access_token: token, adset_id: newAdsetId, status_option: "PAUSED" }),
                })
              } catch { /* singolo ad fallito, continua */ }
            }
          }
        }

        // STEP 3: Rinomina se richiesto
        if (newName && newCampaignId) {
          try { await fetch(`https://graph.facebook.com/v21.0/${newCampaignId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ access_token: token, name: newName }) }) } catch { /* skip */ }
        }

        // STEP 4: Cambia budget se richiesto (prova CBO, poi ABO)
        if (newBudget && newCampaignId) {
          const budgetCents = String(Math.round(Number(newBudget) * 100))
          const cboRes = await fetch(`https://graph.facebook.com/v21.0/${newCampaignId}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ access_token: token, daily_budget: budgetCents }),
          })
          const cboData = await cboRes.json()
          if (!cboRes.ok || cboData.error) {
            const newAdsetsRes = await fetch(`https://graph.facebook.com/v21.0/${newCampaignId}/adsets?fields=id&limit=50&access_token=${encodeURIComponent(token)}`)
            const newAdsetsData = await newAdsetsRes.json()
            for (const adset of newAdsetsData.data || []) {
              try { await fetch(`https://graph.facebook.com/v21.0/${adset.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ access_token: token, daily_budget: budgetCents }) }) } catch { /* skip */ }
            }
          }
        }

        // STEP 5: Verifica su Facebook
        const verifyRes = await fetch(`https://graph.facebook.com/v21.0/${newCampaignId}?fields=id,name,status,daily_budget,lifetime_budget,bid_strategy,objective&access_token=${encodeURIComponent(token)}`)
        const v = await verifyRes.json()

        if (v.error) {
          return NextResponse.json({ success: false, message: `Duplicazione avviata (ID: ${newCampaignId}) ma verifica fallita: ${v.error.message}. Controlla nel BM.` })
        }

        const adsetsRes = await fetch(`https://graph.facebook.com/v21.0/${newCampaignId}/adsets?fields=id,name,status&limit=50&access_token=${encodeURIComponent(token)}`)
        const adsetsData = await adsetsRes.json()
        const adsets = adsetsData.data || []

        let totalAds = 0
        for (const adset of adsets) {
          const adsRes = await fetch(`https://graph.facebook.com/v21.0/${adset.id}/ads?fields=id&limit=100&access_token=${encodeURIComponent(token)}`)
          const adsData = await adsRes.json()
          totalAds += adsData.data?.length || 0
        }

        try {
          await serviceClient.from("campaigns").upsert({
            fb_campaign_id: newCampaignId,
            fb_ad_account_id: accountDbId,
            name: v.name || newName || `${origName} - Copy`,
            status: v.status || newStatus,
            objective: v.objective,
            daily_budget: v.daily_budget ? Number(v.daily_budget) : null,
            bid_strategy: v.bid_strategy,
            last_synced_at: new Date().toISOString(),
          }, { onConflict: "fb_campaign_id,fb_ad_account_id" })
        } catch { /* skip */ }

        const isCBO = !!(v.daily_budget || v.lifetime_budget)
        const adsetList = adsets.length > 0 ? adsets.map((a: any) => `  • ${a.name} (${a.status})`).join("\n") : "  (nessun adset)"

        return NextResponse.json({
          success: true,
          message: [
            `DUPLICATA CON SUCCESSO`,
            `"${origName}" → "${v.name}"`,
            ``,
            `ID: ${newCampaignId}`,
            `Tipo: ${isCBO ? "CBO" : "ABO"} | Obiettivo: ${v.objective}`,
            `Bid: ${v.bid_strategy || "LOWEST_COST"}`,
            `Budget: ${v.daily_budget ? "€" + Number(v.daily_budget) / 100 + "/giorno" : v.lifetime_budget ? "€" + Number(v.lifetime_budget) / 100 + " lifetime" : "a livello adset"}`,
            `Stato: ${v.status}`,
            ``,
            `${adsets.length} adsets, ${totalAds} ads copiati`,
            adsetList,
          ].join("\n"),
          newCampaignId,
        })
      } catch (err: any) {
        return NextResponse.json({ success: false, message: `Errore duplicazione: ${err.message}` })
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
      const lifetimeBudget = params?.lifetimeBudget
      const bidStrategy = params?.bidStrategy || "LOWEST_COST_WITHOUT_CAP"
      const bidAmount = params?.bidAmount
      const roasTarget = params?.roasTarget
      const status = params?.status || "PAUSED"
      const budgetRebalance = params?.budgetRebalance
      const specialAdCategories = params?.specialAdCategories || []
      const startTime = params?.startTime
      const endTime = params?.endTime

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
        const fbParams: Record<string, any> = {
          name,
          objective,
          status,
          special_ad_categories: JSON.stringify(specialAdCategories),
          access_token: account.access_token,
        }
        if (dailyBudget) fbParams.daily_budget = String(Math.round(Number(dailyBudget) * 100))
        if (lifetimeBudget) fbParams.lifetime_budget = String(Math.round(Number(lifetimeBudget) * 100))
        if (bidStrategy) fbParams.bid_strategy = bidStrategy
        if (bidAmount && (bidStrategy === "LOWEST_COST_WITH_BID_CAP" || bidStrategy === "COST_CAP")) {
          fbParams.bid_strategy = bidStrategy
        }
        if (budgetRebalance !== undefined) fbParams.budget_rebalance_flag = budgetRebalance
        if (startTime) fbParams.start_time = startTime
        if (endTime) fbParams.end_time = endTime
        if (lifetimeBudget && !endTime) {
          const end = new Date()
          end.setDate(end.getDate() + 30)
          fbParams.end_time = end.toISOString()
        }

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

        const budgetInfo = dailyBudget ? `€${dailyBudget}/giorno` : lifetimeBudget ? `€${lifetimeBudget} lifetime` : "non impostato"
        return NextResponse.json({
          success: true,
          message: `Campagna "${name}" creata su ${account.name}!\nID: ${data.id}\nObiettivo: ${objective}\nBudget: ${budgetInfo}\nBid Strategy: ${bidStrategy}${bidAmount ? ` (cap: €${bidAmount})` : ""}\nStato: ${status}${budgetRebalance ? "\nCBO Budget Rebalance: attivo" : ""}`,
          campaignId: data.id,
        })
      } catch (err: any) {
        return NextResponse.json({ success: false, message: `Errore: ${err.message}` })
      }
    }

    // ===================================================================
    // FACEBOOK ADS: CREATE FULL CAMPAIGN (campaign + adset + ad in one shot)
    // ===================================================================
    if (action === "create_full_campaign") {
      const accountName = params?.accountName
      const campaignName = params?.campaignName || params?.name
      const objective = params?.objective || "OUTCOME_LEADS"
      const dailyBudget = params?.dailyBudget || params?.budget || "20"
      const lifetimeBudget = params?.lifetimeBudget
      const bidStrategy = params?.bidStrategy || "LOWEST_COST_WITHOUT_CAP"
      const bidAmount = params?.bidAmount
      const status = params?.status || "PAUSED"
      const specialAdCategories = params?.specialAdCategories || []

      const adsetName = params?.adsetName || `${campaignName} - Adset`
      const optimizationGoal = params?.optimizationGoal || "OFFSITE_CONVERSIONS"
      const targeting = params?.targeting || { geo_locations: { countries: ["IT"] }, age_min: 18, age_max: 65 }
      const customEventType = params?.customEventType || "LEAD"
      const pacingType = params?.pacingType
      const dynamicCreative = params?.dynamicCreative

      const adName = params?.adName || `${campaignName} - Ad`
      const pageId = params?.pageId
      const link = params?.link
      const primaryText = params?.primaryText
      const headline = params?.headline
      const description = params?.description
      const imageUrl = params?.imageUrl
      const videoId = params?.videoId
      const callToAction = params?.callToAction || "LEARN_MORE"
      const postId = params?.postId

      if (!campaignName) return NextResponse.json({ success: false, message: "Nome campagna richiesto" })

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
      if (!account?.access_token) return NextResponse.json({ success: false, message: "Nessun account Facebook trovato" })

      const token = account.access_token
      const accountId = account.account_id
      const steps: string[] = []
      const errors: string[] = []

      // STEP 1: Create Campaign
      let newCampaignId: string | null = null
      try {
        const campParams: any = {
          name: campaignName, objective, status,
          special_ad_categories: JSON.stringify(specialAdCategories),
          access_token: token,
        }
        if (dailyBudget) campParams.daily_budget = String(Math.round(Number(dailyBudget) * 100))
        if (lifetimeBudget) campParams.lifetime_budget = String(Math.round(Number(lifetimeBudget) * 100))
        if (bidStrategy) campParams.bid_strategy = bidStrategy
        if (lifetimeBudget && !params?.endTime) {
          const end = new Date(); end.setDate(end.getDate() + 30)
          campParams.end_time = end.toISOString()
        }

        const campRes = await fetch(`https://graph.facebook.com/v21.0/${accountId}/campaigns`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(campParams),
        })
        const campData = await campRes.json()
        if (!campRes.ok || campData.error) {
          return NextResponse.json({ success: false, message: `Errore creazione campagna: ${campData?.error?.message || campRes.status}` })
        }
        newCampaignId = campData.id
        steps.push(`1. Campagna "${campaignName}" creata (ID: ${newCampaignId})`)

        await serviceClient.from("campaigns").insert({
          fb_campaign_id: newCampaignId, fb_ad_account_id: account.id,
          name: campaignName, status, objective,
          daily_budget: dailyBudget ? Math.round(Number(dailyBudget) * 100) : null,
          bid_strategy: bidStrategy,
        })
      } catch (err: any) {
        return NextResponse.json({ success: false, message: `Errore creazione campagna: ${err.message}` })
      }

      // STEP 2: Auto-detect pixel
      let resolvedPixelId: string | null = null
      if (["OFFSITE_CONVERSIONS", "VALUE"].includes(optimizationGoal)) {
        try {
          const pixelRes = await fetch(`https://graph.facebook.com/v21.0/${accountId}/adspixels?fields=id,name&access_token=${encodeURIComponent(token)}`)
          const pixelData = await pixelRes.json()
          if (pixelData.data?.[0]?.id) resolvedPixelId = pixelData.data[0].id
        } catch { /* skip */ }
      }

      // STEP 3: Create Adset
      let newAdsetId: string | null = null
      try {
        let resolvedTargeting = targeting
        if (typeof resolvedTargeting === "string") {
          try { resolvedTargeting = JSON.parse(resolvedTargeting) } catch { resolvedTargeting = {} }
        }
        if (!resolvedTargeting || !resolvedTargeting.geo_locations) {
          resolvedTargeting = { geo_locations: { countries: ["IT"] }, age_min: 18, age_max: 65 }
        }

        const adsetParams: any = {
          name: adsetName,
          campaign_id: newCampaignId,
          optimization_goal: optimizationGoal,
          billing_event: "IMPRESSIONS",
          status,
          targeting: JSON.stringify(resolvedTargeting),
          access_token: token,
        }
        const campaignHasBudget = !!(dailyBudget || lifetimeBudget)
        if (!campaignHasBudget) adsetParams.daily_budget = "2000"
        if (resolvedPixelId) {
          adsetParams.promoted_object = JSON.stringify({ pixel_id: resolvedPixelId, custom_event_type: customEventType })
        }
        if (bidAmount && (bidStrategy === "LOWEST_COST_WITH_BID_CAP" || bidStrategy === "COST_CAP")) {
          adsetParams.bid_amount = String(Math.round(Number(bidAmount) * 100))
        }
        if (pacingType) adsetParams.pacing_type = JSON.stringify([pacingType])
        if (dynamicCreative) adsetParams.dynamic_creative = true
        if (lifetimeBudget && !params?.endTime) {
          const end = new Date(); end.setDate(end.getDate() + 30)
          adsetParams.end_time = end.toISOString()
        }

        let adsetRes = await fetch(`https://graph.facebook.com/v21.0/${accountId}/adsets`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(adsetParams),
        })
        let adsetData = await adsetRes.json()

        if (!adsetRes.ok || adsetData.error) {
          const fbErr = adsetData?.error?.message || ""
          const fbErrDetail = adsetData?.error?.error_user_msg || adsetData?.error?.error_user_title || ""

          if (fbErr.includes("targeting") || fbErr.includes("geo_locations")) {
            adsetParams.targeting = JSON.stringify({ geo_locations: { countries: ["IT"] }, age_min: 18, age_max: 65 })
            adsetRes = await fetch(`https://graph.facebook.com/v21.0/${accountId}/adsets`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify(adsetParams),
            })
            adsetData = await adsetRes.json()
          }

          if ((!adsetRes.ok || adsetData.error) && fbErr.includes("promoted_object")) {
            delete adsetParams.promoted_object
            adsetParams.optimization_goal = "LINK_CLICKS"
            adsetRes = await fetch(`https://graph.facebook.com/v21.0/${accountId}/adsets`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify(adsetParams),
            })
            adsetData = await adsetRes.json()
          }

          if ((!adsetRes.ok || adsetData.error) && adsetParams.daily_budget) {
            delete adsetParams.daily_budget
            adsetRes = await fetch(`https://graph.facebook.com/v21.0/${accountId}/adsets`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify(adsetParams),
            })
            adsetData = await adsetRes.json()
          }

          if (!adsetRes.ok || adsetData.error) {
            errors.push(`Adset: ${adsetData?.error?.message || adsetRes.status}${fbErrDetail ? ` — ${fbErrDetail}` : ""}`)
          } else {
            newAdsetId = adsetData.id
            steps.push(`2. Adset "${adsetName}" creato (ID: ${newAdsetId}) [auto-fixed]`)
          }
        } else {
          newAdsetId = adsetData.id
          steps.push(`2. Adset "${adsetName}" creato (ID: ${newAdsetId})${resolvedPixelId ? ` — Pixel: ${resolvedPixelId}` : ""}`)
        }
      } catch (err: any) {
        errors.push(`Adset: ${err.message}`)
      }

      // STEP 4: Create Ad (if we have the necessary info)
      let newAdId: string | null = null
      if (newAdsetId && (postId || (pageId && (imageUrl || videoId)))) {
        try {
          let creativeId: string | null = null

          if (postId) {
            // Prova a trovare il creative originale che usa questo post
            try {
              const searchRes = await fetch(`https://graph.facebook.com/v21.0/${accountId}/ads?fields=creative{id,effective_object_story_id}&filtering=[{"field":"effective_object_story_id","operator":"EQUAL","value":"${postId}"}]&limit=1&access_token=${encodeURIComponent(token)}`)
              const searchData = await searchRes.json()
              if (searchData.data?.[0]?.creative?.id) creativeId = searchData.data[0].creative.id
            } catch { /* skip */ }
            // Fallback: prova a creare un nuovo creative
            if (!creativeId) {
              const crRes = await fetch(`https://graph.facebook.com/v21.0/${accountId}/adcreatives`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: `Creative - ${adName}`, object_story_id: postId, access_token: token }),
              })
              const crData = await crRes.json()
              if (crRes.ok && !crData.error) creativeId = crData.id
            }
            if (!creativeId) {
              const crRes = await fetch(`https://graph.facebook.com/v21.0/${accountId}/adcreatives`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: `Creative - ${adName}`, source_story_id: postId, access_token: token }),
              })
              const crData = await crRes.json()
              if (crRes.ok && !crData.error) creativeId = crData.id
            }
            if (!creativeId) errors.push(`Creative: non riesco a usare post ${postId}. Usa creativeId direttamente.`)
          } else {
            const objectStorySpec: any = { page_id: pageId }
            if (videoId) {
              objectStorySpec.video_data = {
                video_id: videoId, message: primaryText || "", title: headline || "",
                link_description: description || "", call_to_action: { type: callToAction, value: { link: link || "" } },
              }
            } else {
              objectStorySpec.link_data = {
                link: link || "", message: primaryText || "", name: headline || "",
                description: description || "", call_to_action: { type: callToAction },
              }
              if (imageUrl) objectStorySpec.link_data.image_hash = await (async () => {
                try {
                  const imgRes = await fetch(`https://graph.facebook.com/v21.0/${accountId}/adimages`, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ url: imageUrl, access_token: token }),
                  })
                  const imgData = await imgRes.json()
                  const images = imgData.images || {}
                  return Object.values(images)[0] ? (Object.values(images)[0] as any).hash : null
                } catch { return null }
              })()
            }

            const crRes = await fetch(`https://graph.facebook.com/v21.0/${accountId}/adcreatives`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: `Creative - ${adName}`, object_story_spec: objectStorySpec, access_token: token }),
            })
            const crData = await crRes.json()
            if (crRes.ok && !crData.error) creativeId = crData.id
            else errors.push(`Creative: ${crData?.error?.message || "errore"}`)
          }

          if (creativeId) {
            const adRes = await fetch(`https://graph.facebook.com/v21.0/${accountId}/ads`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: adName, adset_id: newAdsetId, creative: { creative_id: creativeId }, status, access_token: token }),
            })
            const adData = await adRes.json()
            if (adRes.ok && !adData.error) {
              newAdId = adData.id
              steps.push(`3. Ad "${adName}" creato (ID: ${newAdId})`)
            } else {
              errors.push(`Ad: ${adData?.error?.message || "errore"}`)
            }
          }
        } catch (err: any) {
          errors.push(`Ad: ${err.message}`)
        }
      } else if (newAdsetId) {
        steps.push(`3. Ad non creato — fornisci pageId + (imageUrl o videoId) o postId per creare l'ad`)
      }

      const hasAdset = !!newAdsetId
      const hasAd = !!newAdId
      const isComplete = hasAdset

      const summary = [
        isComplete ? `Campagna "${campaignName}" creata su ${account.name}!` : `ATTENZIONE: Campagna "${campaignName}" creata INCOMPLETA su ${account.name}`,
        "",
        ...steps,
        "",
        `Obiettivo: ${objective}`,
        `Budget: ${dailyBudget ? `€${dailyBudget}/giorno` : lifetimeBudget ? `€${lifetimeBudget} lifetime` : "CBO"}`,
        `Bid: ${bidStrategy}${bidAmount ? ` (cap: €${bidAmount})` : ""}`,
        `Stato: ${status}`,
        resolvedPixelId ? `Pixel: ${resolvedPixelId} [auto-detected]` : null,
        !hasAdset ? `\nERRORE: Adset NON creato — la campagna è un contenitore vuoto!` : null,
        !hasAd && hasAdset ? `\nNota: Ad non creato — fornisci postId o pageId+imageUrl per aggiungere l'ad` : null,
        errors.length > 0 ? `\nErrori:\n${errors.join("\n")}` : null,
      ].filter(Boolean)

      return NextResponse.json({
        success: isComplete,
        message: summary.join("\n"),
        campaignId: newCampaignId,
        adsetId: newAdsetId,
        adId: newAdId,
      })
    }

    // ===================================================================
    // FACEBOOK ADS: CREATE ADSET
    // ===================================================================
    if (action === "create_adset") {
      const campaignName = params?.campaignName
      const campaignId = params?.campaignId
      const name = params?.name
      const dailyBudget = params?.dailyBudget || params?.budget
      const lifetimeBudget = params?.lifetimeBudget
      const optimizationGoal = params?.optimizationGoal || "OFFSITE_CONVERSIONS"
      const targeting = params?.targeting || {}
      const status = params?.status || "PAUSED"
      let pixelId = params?.pixelId
      if (pixelId && !/^\d+$/.test(String(pixelId))) pixelId = null
      const customEventType = params?.customEventType || "LEAD"
      const startTime = params?.startTime
      const endTime = params?.endTime
      const bidAmount = params?.bidAmount
      const bidStrategy = params?.bidStrategy
      const roasTarget = params?.roasTarget
      const dynamicCreative = params?.dynamicCreative
      const pacingType = params?.pacingType
      const schedule = params?.schedule
      const attributionSpec = params?.attributionSpec

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

      // Leggi la campagna da Facebook per capire se è CBO o ABO
      let isCBO = false
      try {
        const campInfoRes = await fetch(`https://graph.facebook.com/v21.0/${fbCampaignId}?fields=daily_budget,lifetime_budget&access_token=${encodeURIComponent(token)}`)
        const campInfo = await campInfoRes.json()
        isCBO = !!(campInfo.daily_budget || campInfo.lifetime_budget)
      } catch { /* assume ABO */ }

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
        if (isCBO && (dailyBudget || lifetimeBudget)) {
          // CBO: budget è a livello campagna, non mettere budget sull'adset
        } else {
          if (dailyBudget) fbParams.daily_budget = String(Math.round(Number(dailyBudget) * 100))
          if (lifetimeBudget) fbParams.lifetime_budget = String(Math.round(Number(lifetimeBudget) * 100))
          if (!dailyBudget && !lifetimeBudget && !isCBO) fbParams.daily_budget = "2000"
        }
        if (bidAmount) fbParams.bid_amount = String(Math.round(Number(bidAmount) * 100))
        if (bidStrategy) fbParams.bid_strategy = bidStrategy
        if (roasTarget) fbParams.roas_average_floor = String(Math.round(Number(roasTarget) * 10000))
        let resolvedPixelId = pixelId
        if (!resolvedPixelId && ["OFFSITE_CONVERSIONS", "VALUE"].includes(optimizationGoal)) {
          try {
            const pixelRes = await fetch(`https://graph.facebook.com/v21.0/${accountId}/adspixels?fields=id,name&access_token=${encodeURIComponent(token)}`)
            const pixelData = await pixelRes.json()
            if (pixelData.data?.[0]?.id) resolvedPixelId = pixelData.data[0].id
          } catch { /* skip */ }
        }
        if (resolvedPixelId) {
          fbParams.promoted_object = JSON.stringify({
            pixel_id: resolvedPixelId,
            custom_event_type: customEventType,
          })
        }
        if (startTime) fbParams.start_time = startTime
        if (endTime) fbParams.end_time = endTime
        if (lifetimeBudget && !endTime) {
          const end = new Date()
          end.setDate(end.getDate() + 30)
          fbParams.end_time = end.toISOString()
        }
        if (dynamicCreative) fbParams.dynamic_creative = true
        if (pacingType) fbParams.pacing_type = JSON.stringify([pacingType])
        if (schedule) fbParams.adset_schedule = typeof schedule === "string" ? schedule : JSON.stringify(schedule)
        if (attributionSpec) {
          fbParams.attribution_spec = typeof attributionSpec === "string"
            ? attributionSpec
            : JSON.stringify(attributionSpec)
        }

        const res = await fetch(`https://graph.facebook.com/v21.0/${accountId}/adsets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fbParams),
        })
        const data = await res.json()

        if (!res.ok || data.error) {
          return NextResponse.json({ success: false, message: `Errore Facebook: ${data?.error?.message || res.status}` })
        }

        const budgetInfo = dailyBudget ? `€${dailyBudget}/giorno` : lifetimeBudget ? `€${lifetimeBudget} lifetime` : "CBO"
        const details = [
          `Adset "${name}" creato nella campagna "${campaign.name}"!`,
          `ID: ${data.id}`,
          `Budget: ${budgetInfo}`,
          `Ottimizzazione: ${optimizationGoal}`,
          bidAmount ? `Bid Cap: €${bidAmount}` : null,
          bidStrategy ? `Bid Strategy: ${bidStrategy}` : null,
          roasTarget ? `ROAS Target: ${roasTarget}x` : null,
          dynamicCreative ? "Dynamic Creative: attivo" : null,
          pacingType ? `Pacing: ${pacingType}` : null,
          resolvedPixelId ? `Pixel: ${resolvedPixelId} (${customEventType})${!pixelId ? " [auto-detected]" : ""}` : null,
          `Stato: ${status}`,
        ].filter(Boolean)

        return NextResponse.json({
          success: true,
          message: details.join("\n"),
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
      const instagramActorId = params?.instagramActorId
      const link = params?.link
      const message = params?.primaryText || params?.message
      const headline = params?.headline
      const description = params?.description
      const imageUrl = params?.imageUrl
      const imageUrls = params?.imageUrls
      const videoId = params?.videoId
      const callToAction = params?.callToAction || "LEARN_MORE"
      const status = params?.status || "PAUSED"
      const urlTags = params?.urlTags
      const displayLink = params?.displayLink
      const isDynamicCreative = params?.dynamicCreative

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

      const postId = params?.postId
      const existingCreativeId = params?.creativeId

      if (existingCreativeId) {
        try {
          const adRes = await fetch(`https://graph.facebook.com/v21.0/${accountId}/ads`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, adset_id: resolvedAdsetId, creative: { creative_id: existingCreativeId }, status, access_token: token }),
          })
          const adData = await adRes.json()
          if (!adRes.ok || adData.error) {
            return NextResponse.json({ success: false, message: `Errore: ${adData?.error?.message || adRes.status}` })
          }
          return NextResponse.json({
            success: true,
            message: `Ad "${name}" creato con creative esistente!\nAd ID: ${adData.id}\nCreative ID: ${existingCreativeId}\nStato: ${status}`,
            adId: adData.id,
          })
        } catch (err: any) {
          return NextResponse.json({ success: false, message: `Errore: ${err.message}` })
        }
      }

      if (postId) {
        try {
          let usedCreativeId: string | null = null

          // Metodo 1: Se il postId è un effective_object_story_id, cerca il creative originale
          // cercando tra gli ads esistenti che usano questo post
          if (!usedCreativeId) {
            try {
              const searchRes = await fetch(`https://graph.facebook.com/v21.0/${accountId}/ads?fields=creative{id,effective_object_story_id}&filtering=[{"field":"effective_object_story_id","operator":"EQUAL","value":"${postId}"}]&limit=1&access_token=${encodeURIComponent(token)}`)
              const searchData = await searchRes.json()
              const foundAd = searchData.data?.[0]
              if (foundAd?.creative?.id) usedCreativeId = foundAd.creative.id
            } catch { /* skip */ }
          }

          // Metodo 2: Prova a creare un nuovo creative con object_story_id
          if (!usedCreativeId) {
            const creativeRes = await fetch(`https://graph.facebook.com/v21.0/${accountId}/adcreatives`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: `Post Creative - ${name}`, object_story_id: postId, access_token: token }),
            })
            const creativeData = await creativeRes.json()
            if (creativeRes.ok && !creativeData.error) {
              usedCreativeId = creativeData.id
            }
          }

          // Metodo 3: Prova con source_story_id
          if (!usedCreativeId) {
            const creativeRes = await fetch(`https://graph.facebook.com/v21.0/${accountId}/adcreatives`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: `Post Creative - ${name}`, source_story_id: postId, access_token: token }),
            })
            const creativeData = await creativeRes.json()
            if (creativeRes.ok && !creativeData.error) {
              usedCreativeId = creativeData.id
            }
          }

          if (!usedCreativeId) {
            return NextResponse.json({ success: false, message: `Non riesco a usare il post ${postId}. Prova con creativeId al posto di postId (usa get_post_ids per ottenere il creativeId).` })
          }

          const adRes = await fetch(`https://graph.facebook.com/v21.0/${accountId}/ads`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, adset_id: resolvedAdsetId, creative: { creative_id: usedCreativeId }, status, access_token: token }),
          })
          const adData = await adRes.json()
          if (!adRes.ok || adData.error) {
            return NextResponse.json({ success: false, message: `Errore creazione ad: ${adData?.error?.message || adRes.status}` })
          }

          return NextResponse.json({
            success: true,
            message: `Ad "${name}" creato con post esistente!\nAd ID: ${adData.id}\nCreative ID: ${usedCreativeId}\nSocial proof mantenuta!\nStato: ${status}`,
            adId: adData.id,
            creativeId: usedCreativeId,
          })
        } catch (err: any) {
          return NextResponse.json({ success: false, message: `Errore: ${err.message}` })
        }
      }

      if (!pageId) return NextResponse.json({ success: false, message: "Page ID Facebook richiesto (la pagina da cui pubblicare l'ad). In alternativa usa postId per un post esistente." })

      try {
        const objectStorySpec: any = { page_id: pageId }
        if (instagramActorId) objectStorySpec.instagram_actor_id = instagramActorId

        if (isDynamicCreative && (imageUrls?.length || 0) > 0) {
          const assetFeedSpec: any = {
            images: (imageUrls || [imageUrl]).filter(Boolean).map((url: string) => ({ url })),
            bodies: Array.isArray(message) ? message.map((t: string) => ({ text: t })) : [{ text: message || "" }],
            titles: Array.isArray(headline) ? headline.map((t: string) => ({ text: t })) : [{ text: headline || "" }],
            descriptions: Array.isArray(description) ? description.map((t: string) => ({ text: t })) : [{ text: description || "" }],
            call_to_action_types: [callToAction],
            link_urls: [{ website_url: link || "" }],
          }

          const creativeRes = await fetch(`https://graph.facebook.com/v21.0/${accountId}/adcreatives`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: `DC - ${name}`,
              asset_feed_spec: assetFeedSpec,
              object_story_spec: { page_id: pageId, ...(instagramActorId ? { instagram_actor_id: instagramActorId } : {}) },
              ...(urlTags ? { url_tags: urlTags } : {}),
              access_token: token,
            }),
          })
          const creativeData = await creativeRes.json()
          if (!creativeRes.ok || creativeData.error) {
            return NextResponse.json({ success: false, message: `Errore dynamic creative: ${creativeData?.error?.message || creativeRes.status}` })
          }

          const adRes = await fetch(`https://graph.facebook.com/v21.0/${accountId}/ads`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, adset_id: resolvedAdsetId, creative: { creative_id: creativeData.id }, status, access_token: token }),
          })
          const adData = await adRes.json()
          if (!adRes.ok || adData.error) {
            return NextResponse.json({ success: false, message: `Errore creazione ad: ${adData?.error?.message || adRes.status}` })
          }

          const imgCount = (imageUrls || [imageUrl]).filter(Boolean).length
          const bodyCount = Array.isArray(message) ? message.length : 1
          const titleCount = Array.isArray(headline) ? headline.length : 1
          return NextResponse.json({
            success: true,
            message: `Dynamic Creative Ad "${name}" creato!\nAd ID: ${adData.id}\nImmagini: ${imgCount}, Testi: ${bodyCount}, Headline: ${titleCount}\nFacebook testerà automaticamente tutte le combinazioni.\nStato: ${status}`,
            adId: adData.id,
            creativeId: creativeData.id,
          })
        }

        if (videoId) {
          objectStorySpec.video_data = {
            video_id: videoId, title: headline || "", message: message || "",
            link_description: description || "",
            call_to_action: { type: callToAction, value: { link: link || "" } },
            ...(imageUrl ? { image_url: imageUrl } : {}),
          }
        } else if (imageUrls && imageUrls.length > 1) {
          objectStorySpec.link_data = {
            link: link || "",
            message: message || "",
            child_attachments: imageUrls.map((url: string, i: number) => ({
              link: link || "",
              picture: url,
              name: Array.isArray(headline) ? headline[i] || headline[0] : headline || "",
              description: Array.isArray(description) ? description[i] || description[0] : description || "",
              call_to_action: { type: callToAction },
            })),
          }
        } else {
          objectStorySpec.link_data = {
            link: link || "", message: message || "", name: headline || "",
            description: description || "",
            call_to_action: { type: callToAction },
            ...(imageUrl ? { picture: imageUrl } : {}),
            ...(displayLink ? { caption: displayLink } : {}),
          }
        }

        const creativePayload: any = {
          name: `Creative - ${name}`,
          object_story_spec: objectStorySpec,
          access_token: token,
        }
        if (urlTags) creativePayload.url_tags = urlTags

        const creativeRes = await fetch(`https://graph.facebook.com/v21.0/${accountId}/adcreatives`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(creativePayload),
        })
        const creativeData = await creativeRes.json()
        if (!creativeRes.ok || creativeData.error) {
          return NextResponse.json({ success: false, message: `Errore creazione creative: ${creativeData?.error?.message || creativeRes.status}` })
        }

        const adRes = await fetch(`https://graph.facebook.com/v21.0/${accountId}/ads`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, adset_id: resolvedAdsetId, creative: { creative_id: creativeData.id }, status, access_token: token }),
        })
        const adData = await adRes.json()
        if (!adRes.ok || adData.error) {
          return NextResponse.json({ success: false, message: `Errore creazione ad: ${adData?.error?.message || adRes.status}` })
        }

        const adType = videoId ? "Video" : (imageUrls && imageUrls.length > 1) ? "Carousel" : "Image"
        return NextResponse.json({
          success: true,
          message: `${adType} Ad "${name}" creato!\nAd ID: ${adData.id}\nCreative ID: ${creativeData.id}\nAdset: ${resolvedAdsetId}\nStato: ${status}`,
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
        if (updates.lifetimeBudget) fbParams.lifetime_budget = String(Math.round(Number(updates.lifetimeBudget) * 100))
        if (updates.bidAmount) fbParams.bid_amount = String(Math.round(Number(updates.bidAmount) * 100))
        if (updates.bidStrategy) fbParams.bid_strategy = updates.bidStrategy
        if (updates.roasTarget) fbParams.roas_average_floor = String(Math.round(Number(updates.roasTarget) * 10000))
        if (updates.targeting) fbParams.targeting = typeof updates.targeting === "string" ? updates.targeting : JSON.stringify(updates.targeting)
        if (updates.optimizationGoal) fbParams.optimization_goal = updates.optimizationGoal
        if (updates.pacingType) fbParams.pacing_type = JSON.stringify([updates.pacingType])
        if (updates.dynamicCreative !== undefined) fbParams.dynamic_creative = updates.dynamicCreative
        if (updates.schedule) fbParams.adset_schedule = typeof updates.schedule === "string" ? updates.schedule : JSON.stringify(updates.schedule)
        if (updates.attributionSpec) fbParams.attribution_spec = typeof updates.attributionSpec === "string" ? updates.attributionSpec : JSON.stringify(updates.attributionSpec)
        if (updates.startTime) fbParams.start_time = updates.startTime
        if (updates.endTime) fbParams.end_time = updates.endTime
        if (updates.pixelId && /^\d+$/.test(String(updates.pixelId))) {
          fbParams.promoted_object = JSON.stringify({
            pixel_id: updates.pixelId,
            custom_event_type: updates.customEventType || "LEAD",
          })
        }

        const res = await fetch(`https://graph.facebook.com/v21.0/${resolvedId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fbParams),
        })
        const data = await res.json()
        if (!res.ok || data.error) {
          return NextResponse.json({ success: false, message: `Errore Facebook: ${data?.error?.message || res.status}` })
        }

        const changeList = Object.entries(updates).map(([k, v]) => {
          if (typeof v === "object") return `${k}: ${JSON.stringify(v)}`
          return `${k}: ${v}`
        }).join("\n")
        return NextResponse.json({ success: true, message: `Adset ${resolvedId} aggiornato:\n${changeList}` })
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

      const { data: campaign } = await serviceClient.from("campaigns")
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

    // ===================================================================
    // FACEBOOK ADS: GET POST IDs FROM ADS
    // ===================================================================
    if (action === "get_post_ids" || action === "get_ad_post_ids") {
      const campaignName = params?.campaignName
      const adsetName = params?.adsetName
      const adId = params?.adId

      if (!campaignName && !adsetName && !adId) {
        return NextResponse.json({ success: false, message: "Specifica campaignName, adsetName o adId" })
      }

      const { data: campaigns } = await serviceClient.from("campaigns")
        .select("fb_campaign_id, name, fb_ad_account:fb_ad_accounts(access_token)")
        .ilike("name", `%${campaignName || ""}%`).limit(10)

      const results: string[] = []
      const postIds: any[] = []

      for (const c of campaigns || []) {
        const token = (c.fb_ad_account as any)?.access_token
        if (!token) continue

        try {
          if (adId) {
            const res = await fetch(`https://graph.facebook.com/v21.0/${adId}?fields=id,name,creative{id,effective_object_story_id,object_story_id,thumbnail_url}&access_token=${encodeURIComponent(token)}`)
            const data = await res.json()
            if (data && !data.error) {
              const storyId = data.creative?.effective_object_story_id || data.creative?.object_story_id
              results.push(`Ad "${data.name}": Post ID = ${storyId || "N/A"}`)
              if (storyId) postIds.push({ adId: data.id, adName: data.name, postId: storyId, creativeId: data.creative?.id })
            }
            break
          }

          const adsetsRes = await fetch(`https://graph.facebook.com/v21.0/${c.fb_campaign_id}/adsets?fields=id,name&limit=50&access_token=${encodeURIComponent(token)}`)
          const adsetsData = await adsetsRes.json()

          for (const adset of adsetsData.data || []) {
            if (adsetName && !adset.name.toLowerCase().includes(adsetName.toLowerCase())) continue

            const adsRes = await fetch(`https://graph.facebook.com/v21.0/${adset.id}/ads?fields=id,name,creative{id,effective_object_story_id,object_story_id,thumbnail_url}&limit=50&access_token=${encodeURIComponent(token)}`)
            const adsData = await adsRes.json()

            for (const ad of adsData.data || []) {
              const storyId = ad.creative?.effective_object_story_id || ad.creative?.object_story_id
              if (storyId) {
                results.push(`📄 "${ad.name}" → Post ID: **${storyId}**`)
                postIds.push({
                  adId: ad.id,
                  adName: ad.name,
                  adsetName: adset.name,
                  postId: storyId,
                  creativeId: ad.creative?.id,
                })
              } else {
                results.push(`📄 "${ad.name}" → Post ID: non disponibile`)
              }
            }
          }
        } catch { /* skip */ }
      }

      if (postIds.length === 0) {
        return NextResponse.json({ success: true, message: "Nessun post ID trovato per le ads specificate." })
      }

      return NextResponse.json({
        success: true,
        message: `Post ID trovati:\n\n${results.join("\n")}\n\nPuoi usare questi Post ID per creare nuovi ad con la stessa social proof (like, commenti, condivisioni) usando create_ad con postId.`,
        postIds,
      })
    }

    return NextResponse.json({ success: false, message: `Azione "${action}" non supportata` })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error" }, { status: 500 })
  }
}
