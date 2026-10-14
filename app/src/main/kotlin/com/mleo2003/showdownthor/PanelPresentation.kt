package com.mleo2003.showdownthor

import android.annotation.SuppressLint
import android.app.Presentation
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.HapticFeedbackConstants
import android.view.KeyEvent
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import android.view.Display

/**
 * The bottom screen: assets/panel/ in a WebView, fed with the Showdown page's battle snapshot ([update]) and sending
 * choices back through [MainActivity.panelAct].
 */
@SuppressLint("SetJavaScriptEnabled")
class PanelPresentation(private val activity: MainActivity, display: Display) : Presentation(activity, display) {
    private val main = Handler(Looper.getMainLooper())
    private lateinit var web: WebView
    private var pageReady = false
    private var pending: String? = null

    /** True while the panel has choices on screen, so the controller drives it instead of the page. */
    var wantsKeys = false
        private set

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(context)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.setBackgroundColor(Color.parseColor("#10161f"))
        web.isVerticalScrollBarEnabled = false
        web.webViewClient = WebViewClient()
        web.addJavascriptInterface(Bridge(), "ThorPanel")
        setContentView(web)
        web.loadUrl("file:///android_asset/panel/index.html")
    }

    /** Tapping the bottom screen moves key focus here; hand controller buttons back to the activity. */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean = activity.handlePanelKey(event) || super.dispatchKeyEvent(event)

    override fun onStop() {
        web.destroy()
        super.onStop()
    }

    /** [json] is the page snapshot, already valid JS. */
    fun update(json: String) {
        if (pageReady) js("thorUpdate($json)") else pending = json
    }

    fun key(name: String) = js("thorKey('$name')")

    /** "<percent>,<charging>" from the activity's battery receiver. */
    fun battery(value: String) = js("thorBattery('$value')")

    private fun js(code: String) {
        if (::web.isInitialized) web.evaluateJavascript(code, null)
    }

    inner class Bridge {
        @JavascriptInterface
        fun ready() {
            main.post {
                pageReady = true
                pending?.let { update(it) }
                pending = null
                activity.panelReady()
            }
        }

        @JavascriptInterface
        fun act(json: String) {
            main.post {
                web.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
                activity.panelAct(json)
            }
        }

        @JavascriptInterface
        fun hideAds(): Boolean = activity.hideAds

        @JavascriptInterface
        fun setHideAds(on: Boolean) {
            main.post { activity.setHideAds(on) }
        }

        @JavascriptInterface
        fun wantKeys(on: Boolean) {
            main.post { wantsKeys = on }
        }
    }
}
