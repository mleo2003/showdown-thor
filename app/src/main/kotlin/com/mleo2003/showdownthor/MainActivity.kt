package com.mleo2003.showdownthor

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.hardware.display.DisplayManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Display
import android.view.KeyEvent
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.net.URL

/**
 * Showdown Thor: the official Pokémon Showdown client (play.pokemonshowdown.com, unchanged) on the top screen, and a
 * touch + controller panel on the bottom screen ([PanelPresentation]).
 *
 * assets/inject/thor-inject.js runs in the Showdown page: it reports the battle state (moves, switches, both sides)
 * through [TopBridge] and performs the panel's actions by clicking the page's own buttons, so every choice goes
 * through the official client exactly as a tap on the top screen would.
 */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var displayManager: DisplayManager
    private val main = Handler(Looper.getMainLooper())
    private var panel: PanelPresentation? = null
    private var lastState = "null"
    private var injectScript: String? = null
    /** Testing only: "host:port" of a private Showdown server, from `am start --es testServer ...` (adb). */
    private var testServer: String? = null
    private var battery = ""
    /** Panel setting "Hide ads" (off by default): block the ad network and hide the empty ad boxes. */
    @Volatile var hideAds = false
        private set

    /** Battery level for the panel header (sticky broadcast: the current value arrives on registration). */
    private val batteryReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
            val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
            if (level < 0 || scale <= 0) return
            val charging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL
            battery = "${level * 100 / scale},$charging"
            panel?.battery(battery)
        }
    }

    private val displayListener = object : DisplayManager.DisplayListener {
        override fun onDisplayAdded(displayId: Int) { main.post { showPanel() } }
        override fun onDisplayRemoved(displayId: Int) {
            main.post {
                if (panel?.display?.displayId == displayId) {
                    panel?.dismiss()
                    panel = null
                    syncPanelFlag()
                }
            }
        }
        override fun onDisplayChanged(displayId: Int) {}
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        displayManager = getSystemService(DisplayManager::class.java)
        hideAds = getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean(PREF_HIDE_ADS, false)
        testServer = intent.getStringExtra("testServer")?.takeIf { Regex("[A-Za-z0-9.-]+:[0-9]+").matches(it) }
        WebView.setWebContentsDebuggingEnabled(true) // inspectable over adb, like PokéRogue Thor

        web = WebView(this)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            // Honour the page's viewport (thor-inject.js sets 1280 px), so the desktop layout fits the top screen
            useWideViewPort = true
            loadWithOverviewMode = true
            setSupportZoom(false)
        }
        // Test mode only: the private server is plain ws:// on localhost, from the https Showdown page
        if (testServer != null) web.settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        web.setBackgroundColor(0xFF1B2430.toInt())
        web.addJavascriptInterface(TopBridge(), "ShowdownThor")
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val host = request.url.host ?: return false
                if (!request.isForMainFrame || isShowdownHost(host)) return false
                // Links out of Showdown (Smogon analyses, Discord, ...) open in the browser
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, request.url))
                } catch (_: ActivityNotFoundException) {
                }
                return true
            }

            override fun onPageFinished(view: WebView, url: String) = inject()

            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                // "Hide ads" on (panel setting, off by default): the ad network and exchanges get an empty answer
                if (hideAds && request.url.host?.let(::isAdHost) == true) {
                    return WebResourceResponse("text/plain", "utf-8", ByteArrayInputStream(ByteArray(0)))
                }
                val server = testServer ?: return null
                if (request.url.host == "localhost" && request.url.path == TEST_PAGE_PATH) {
                    // Test mode: the official client page under a local address, so it may talk to the private
                    // server (Chromium blocks public sites from reaching localhost); testclient = its own mode for this
                    return try {
                        val page = URL(START_URL).readText()
                            .replace("src=\"//", "src=\"https://").replace("href=\"//", "href=\"https://")
                        // The page has no <head> tag, and its first <script> sits inside a comment: go after the charset
                        val meta = page.indexOf("<meta").let { if (it < 0) 0 else page.indexOf('>', it) + 1 }
                        val html = page.substring(0, meta) + "<script>var Config = {testclient: true};</script>" + page.substring(meta)
                        WebResourceResponse("text/html", "utf-8", ByteArrayInputStream(html.toByteArray()))
                    } catch (_: Exception) {
                        null
                    }
                }
                if (request.url.scheme == "http" && request.url.host?.let(::isShowdownHost) == true) {
                    // Test mode: the localhost page asks for sprites etc. over http, which Android blocks; fetch them over https
                    return try {
                        val conn = URL(request.url.buildUpon().scheme("https").build().toString()).openConnection()
                        val type = conn.contentType?.substringBefore(';') ?: "application/octet-stream"
                        WebResourceResponse(type, null, conn.getInputStream())
                    } catch (_: Exception) {
                        null
                    }
                }
                if (request.url.host != "play.pokemonshowdown.com" || request.url.path != "/config/config.js") return null
                return try {
                    // Test mode: the official client, pointed at a private server (e.g. the Mac through adb reverse)
                    val (host, port) = server.split(':')
                    val config = URL(request.url.toString()).readText() +
                        "\nConfig.defaultserver = {id: 'showdown', host: '$host', port: $port, httpport: $port, altport: $port, registered: false};\nConfig.sockjsprefix = '/showdown';\n"
                    WebResourceResponse("application/javascript", "utf-8", ByteArrayInputStream(config.toByteArray()))
                } catch (_: Exception) {
                    null
                }
            }
        }
        web.webChromeClient = WebChromeClient() // alert()/confirm(), e.g. "Forfeit this battle?"
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)
        setContentView(web)
        hideSystemBars()
        val startUrl = testServer?.let { "http://localhost:${it.substringAfter(':')}$TEST_PAGE_PATH" } ?: START_URL
        if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) web.loadUrl(startUrl)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onStart() {
        super.onStart()
        displayManager.registerDisplayListener(displayListener, main)
        registerReceiver(batteryReceiver, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        showPanel()
    }

    override fun onStop() {
        // Give the bottom screen back (Argosy's companion) while we're in the background; the Showdown connection
        // stays up so a battle isn't lost.
        displayManager.unregisterDisplayListener(displayListener)
        try { unregisterReceiver(batteryReceiver) } catch (_: IllegalArgumentException) {}
        panel?.dismiss()
        panel = null
        CookieManager.getInstance().flush()
        super.onStop()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    @Deprecated("Back = the page's own history (rooms) only")
    override fun onBackPressed() {
        // The controller's B arrives as Back when the panel has nothing to choose: never leave the app on it (Home does)
        if (web.canGoBack()) web.goBack()
    }

    /** Controller buttons drive the panel while it has something to choose; otherwise they go to the page. */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean = handlePanelKey(event) || super.dispatchKeyEvent(event)

    fun handlePanelKey(event: KeyEvent): Boolean {
        val p = panel ?: return false
        val key = PANEL_KEYS[event.keyCode] ?: return false
        if (!p.wantsKeys) return false
        if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) p.key(key)
        return true
    }

    private fun showPanel() {
        if (panel != null) return
        val display = displayManager.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION)
            .firstOrNull { it.displayId != Display.DEFAULT_DISPLAY } ?: return
        try {
            panel = PanelPresentation(this, display).also { it.show() }
            syncPanelFlag()
        } catch (_: WindowManager.InvalidDisplayException) {
            panel = null
        }
    }

    private fun inject() {
        val script = injectScript ?: assets.open("inject/thor-inject.js").bufferedReader().use { it.readText() }
            .also { injectScript = it }
        // The top screen's width in CSS px, for the page's fixed zoom (thor-inject.js setViewport)
        web.evaluateJavascript("window.ThorScreenWidth = ${web.width / resources.displayMetrics.density};", null)
        web.evaluateJavascript("window.ThorHideAds = $hideAds;", null)
        web.evaluateJavascript(script, null)
        syncPanelFlag()
    }

    /** Without the bottom screen, the top screen keeps the client's own battle controls. */
    private fun syncPanelFlag() = web.evaluateJavascript("window.ThorInject && ThorInject.setPanel(${panel != null})", null)

    /** From the panel: a choice to perform in the page (JSON, see thor-inject.js act()). */
    fun panelAct(json: String) {
        web.evaluateJavascript("window.ThorInject && ThorInject.act(${JSONObject.quote(json)})", null)
    }

    /** From the panel: turn "Hide ads" on or off; the page reloads so the ad network is (un)blocked from the start. */
    fun setHideAds(on: Boolean) {
        if (on == hideAds) return
        hideAds = on
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(PREF_HIDE_ADS, on).apply()
        web.reload()
    }

    fun panelReady() {
        panel?.update(lastState)
        if (battery.isNotEmpty()) panel?.battery(battery)
        web.evaluateJavascript("window.ThorInject && ThorInject.resync()", null)
    }

    private fun hideSystemBars() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.let {
                it.hide(WindowInsets.Type.systemBars())
                it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
        }
    }

    inner class TopBridge {
        /** The page's battle snapshot (JSON), sent only when it changes. */
        @JavascriptInterface
        fun state(json: String) {
            main.post {
                lastState = json
                panel?.update(json)
            }
        }
    }

    companion object {
        private const val PREFS = "settings"
        private const val PREF_HIDE_ADS = "hideAds"
        const val START_URL = "https://play.pokemonshowdown.com/"
        private const val TEST_PAGE_PATH = "/thor-test"

        private val PANEL_KEYS = mapOf(
            KeyEvent.KEYCODE_DPAD_UP to "up",
            KeyEvent.KEYCODE_DPAD_DOWN to "down",
            KeyEvent.KEYCODE_DPAD_LEFT to "left",
            KeyEvent.KEYCODE_DPAD_RIGHT to "right",
            KeyEvent.KEYCODE_BUTTON_A to "a",
            KeyEvent.KEYCODE_BUTTON_B to "b",
            KeyEvent.KEYCODE_BUTTON_X to "x",
            KeyEvent.KEYCODE_BUTTON_Y to "y",
            KeyEvent.KEYCODE_BUTTON_L1 to "l1",
            KeyEvent.KEYCODE_BUTTON_R1 to "r1",
        )

        private val AD_HOSTS = listOf(
            "vntsm.com", "venatusmedia.com", "atmtd.com", "privacymanager.io", "doubleclick.net", "googlesyndication.com",
            "googletagservices.com", "googleadservices.com", "adservice.google.com", "amazon-adsystem.com", "adnxs.com",
            "pubmatic.com", "rubiconproject.com", "openx.net", "criteo.com", "criteo.net", "casalemedia.com", "indexww.com",
            "adsafeprotected.com", "moatads.com", "teads.tv", "taboola.com", "outbrain.com", "33across.com", "sharethrough.com",
            "smartadserver.com", "yieldmo.com", "media.net", "lijit.com", "sovrn.com", "id5-sync.com", "crwdcntrl.net",
            "adform.net", "triplelift.com", "gumgum.com", "onetag-sys.com", "seedtag.com", "minutemedia-prebid.com",
        )

        fun isAdHost(host: String) = AD_HOSTS.any { host == it || host.endsWith(".$it") }

        fun isShowdownHost(host: String) = host == "pokemonshowdown.com" || host.endsWith(".pokemonshowdown.com") ||
            host.endsWith(".psim.us")
    }
}
