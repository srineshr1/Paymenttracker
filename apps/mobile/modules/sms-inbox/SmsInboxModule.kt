package com.paymenttracker.ledger

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.database.ContentObserver
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Telephony
import android.telephony.SmsMessage
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONArray
import org.json.JSONObject

/**
 * On-device SMS inbox reader + live listener (Android only).
 * Requires READ_SMS (+ RECEIVE_SMS for broadcast). Never uploads messages.
 */
class SmsInboxModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  companion object {
    private const val PREFS = "spentd_sms_inbox"
    private const val KEY_PENDING = "pending_json"
    private const val MAX_PENDING = 40
    const val EVENT_RECEIVED = "SmsInboxReceived"
  }

  private var listening = false
  private var observer: ContentObserver? = null
  private var smsReceiver: BroadcastReceiver? = null
  private var lastSeenId: Long = -1L
  private val mainHandler = Handler(Looper.getMainLooper())

  override fun getName(): String = "SmsInbox"

  override fun getConstants(): Map<String, Any> =
    mapOf("EVENT_RECEIVED" to EVENT_RECEIVED)

  @ReactMethod
  fun isAvailable(promise: Promise) {
    promise.resolve(true)
  }

  @ReactMethod
  fun hasPermission(promise: Promise) {
    promise.resolve(hasReadPermission())
  }

  @ReactMethod
  fun hasReceivePermission(promise: Promise) {
    promise.resolve(hasReceivePermission())
  }

  @ReactMethod
  fun isListening(promise: Promise) {
    promise.resolve(listening)
  }

  /**
   * List inbox messages newest first.
   * @param maxCount cap on rows scanned from the provider (hard max 2000)
   * @param minDateMs only messages with date >= this (0 = no floor)
   */
  @ReactMethod
  fun listInbox(maxCount: Int, minDateMs: Double, promise: Promise) {
    if (!hasReadPermission()) {
      promise.reject("E_SMS_PERMISSION", "READ_SMS permission is not granted")
      return
    }

    try {
      promise.resolve(queryInbox(maxCount.coerceIn(1, 2000), minDateMs.toLong().coerceAtLeast(0L)))
    } catch (e: SecurityException) {
      promise.reject("E_SMS_PERMISSION", e.message, e)
    } catch (e: Exception) {
      promise.reject("E_SMS_READ", e.message, e)
    }
  }

  /**
   * Start live watch: ContentObserver on inbox + SMS_RECEIVED broadcast.
   * Emits SmsInboxReceived for each new message. Queues when JS is not ready.
   */
  @ReactMethod
  fun startListening(promise: Promise) {
    if (!hasReadPermission()) {
      promise.reject("E_SMS_PERMISSION", "READ_SMS permission is not granted")
      return
    }
    if (listening) {
      promise.resolve(true)
      return
    }

    try {
      lastSeenId = queryLatestId()
      registerObserver()
      registerSmsReceiver()
      listening = true
      promise.resolve(true)
    } catch (e: Exception) {
      stopListeningInternal()
      promise.reject("E_SMS_LISTEN", e.message, e)
    }
  }

  @ReactMethod
  fun stopListening(promise: Promise) {
    stopListeningInternal()
    promise.resolve(true)
  }

  /** Drain messages stored while the JS bridge was unavailable. */
  @ReactMethod
  fun drainPending(promise: Promise) {
    try {
      val prefs = prefs()
      val raw = prefs.getString(KEY_PENDING, null)
      prefs.edit().remove(KEY_PENDING).apply()
      val out: WritableArray = Arguments.createArray()
      if (!raw.isNullOrBlank()) {
        val arr = JSONArray(raw)
        for (i in 0 until arr.length()) {
          val o = arr.getJSONObject(i)
          val map = Arguments.createMap()
          if (o.has("id") && !o.isNull("id")) map.putString("id", o.getString("id"))
          else map.putNull("id")
          if (o.has("address") && !o.isNull("address")) {
            map.putString("address", o.getString("address"))
          } else {
            map.putNull("address")
          }
          map.putString("body", o.optString("body", ""))
          map.putDouble("dateMs", o.optDouble("dateMs", 0.0))
          out.pushMap(map)
        }
      }
      promise.resolve(out)
    } catch (e: Exception) {
      promise.reject("E_SMS_PENDING", e.message, e)
    }
  }

  // Required for NativeEventEmitter on newer RN
  @ReactMethod
  fun addListener(eventName: String) {
    // no-op
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // no-op
  }

  override fun invalidate() {
    stopListeningInternal()
    super.invalidate()
  }

  private fun hasReadPermission(): Boolean =
    ContextCompat.checkSelfPermission(
      reactContext,
      Manifest.permission.READ_SMS
    ) == PackageManager.PERMISSION_GRANTED

  private fun hasReceivePermission(): Boolean =
    ContextCompat.checkSelfPermission(
      reactContext,
      Manifest.permission.RECEIVE_SMS
    ) == PackageManager.PERMISSION_GRANTED

  private fun prefs(): SharedPreferences =
    reactContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun stopListeningInternal() {
    listening = false
    observer?.let {
      try {
        reactContext.contentResolver.unregisterContentObserver(it)
      } catch (_: Exception) {
      }
    }
    observer = null
    smsReceiver?.let {
      try {
        reactContext.unregisterReceiver(it)
      } catch (_: Exception) {
      }
    }
    smsReceiver = null
  }

  private fun registerObserver() {
    val obs =
      object : ContentObserver(mainHandler) {
        override fun onChange(selfChange: Boolean) {
          onChange(selfChange, null)
        }

        override fun onChange(selfChange: Boolean, uri: Uri?) {
          if (!listening || !hasReadPermission()) return
          mainHandler.post { emitNewInboxRows() }
        }
      }
    reactContext.contentResolver.registerContentObserver(
      Telephony.Sms.Inbox.CONTENT_URI,
      true,
      obs
    )
    // Also watch generic sms URI (some OEMs only notify here)
    reactContext.contentResolver.registerContentObserver(
      Telephony.Sms.CONTENT_URI,
      true,
      obs
    )
    observer = obs
  }

  private fun registerSmsReceiver() {
    if (!hasReceivePermission()) return

    val receiver =
      object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
          if (intent?.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
          try {
            val pdus = intent.extras?.get("pdus") as? Array<*> ?: return
            val format = intent.getStringExtra("format")
            val chunks = mutableListOf<Pair<String?, String>>()
            for (pdu in pdus) {
              val bytes = pdu as? ByteArray ?: continue
              val msg =
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                  SmsMessage.createFromPdu(bytes, format)
                } else {
                  @Suppress("DEPRECATION")
                  SmsMessage.createFromPdu(bytes)
                }
              val body = msg.messageBody ?: continue
              chunks.add(msg.originatingAddress to body)
            }
            // Concat multi-part
            if (chunks.isEmpty()) return
            val address = chunks.first().first
            val body = chunks.joinToString("") { it.second }
            deliverMessage(
              id = null,
              address = address,
              body = body,
              dateMs = System.currentTimeMillis()
            )
          } catch (_: Exception) {
            // Fall back to ContentObserver path
          }
        }
      }

    val filter = IntentFilter(Telephony.Sms.Intents.SMS_RECEIVED_ACTION)
    filter.priority = IntentFilter.SYSTEM_HIGH_PRIORITY
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      reactContext.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
    } else {
      @Suppress("UnspecifiedRegisterReceiverFlag")
      reactContext.registerReceiver(receiver, filter)
    }
    smsReceiver = receiver
  }

  private fun emitNewInboxRows() {
    if (!hasReadPermission()) return
    val projection =
      arrayOf(
        Telephony.Sms._ID,
        Telephony.Sms.ADDRESS,
        Telephony.Sms.BODY,
        Telephony.Sms.DATE
      )
    var cursor: Cursor? = null
    try {
      cursor =
        reactContext.contentResolver.query(
          Telephony.Sms.Inbox.CONTENT_URI,
          projection,
          if (lastSeenId >= 0) "${Telephony.Sms._ID} > ?" else null,
          if (lastSeenId >= 0) arrayOf(lastSeenId.toString()) else null,
          "${Telephony.Sms._ID} ASC LIMIT 40"
        )
      if (cursor == null) return
      val idxId = cursor.getColumnIndex(Telephony.Sms._ID)
      val idxAddress = cursor.getColumnIndex(Telephony.Sms.ADDRESS)
      val idxBody = cursor.getColumnIndex(Telephony.Sms.BODY)
      val idxDate = cursor.getColumnIndex(Telephony.Sms.DATE)
      while (cursor.moveToNext()) {
        val id = if (idxId >= 0) cursor.getLong(idxId) else continue
        if (id > lastSeenId) lastSeenId = id
        deliverMessage(
          id = id.toString(),
          address = if (idxAddress >= 0) cursor.getString(idxAddress) else null,
          body = if (idxBody >= 0) cursor.getString(idxBody) ?: "" else "",
          dateMs = if (idxDate >= 0) cursor.getLong(idxDate) else System.currentTimeMillis()
        )
      }
    } catch (_: Exception) {
    } finally {
      cursor?.close()
    }
  }

  private fun deliverMessage(
    id: String?,
    address: String?,
    body: String,
    dateMs: Long
  ) {
    if (body.isBlank()) return
    val map = Arguments.createMap()
    map.putString("id", id)
    map.putString("address", address)
    map.putString("body", body)
    map.putDouble("dateMs", dateMs.toDouble())

    if (reactContext.hasActiveReactInstance()) {
      try {
        reactContext
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit(EVENT_RECEIVED, map)
        return
      } catch (_: Exception) {
        // queue below
      }
    }
    queuePending(id, address, body, dateMs)
  }

  private fun queuePending(
    id: String?,
    address: String?,
    body: String,
    dateMs: Long
  ) {
    try {
      val prefs = prefs()
      val arr =
        try {
          JSONArray(prefs.getString(KEY_PENDING, "[]") ?: "[]")
        } catch (_: Exception) {
          JSONArray()
        }
      val o = JSONObject()
      o.put("id", id)
      o.put("address", address)
      o.put("body", body)
      o.put("dateMs", dateMs)
      arr.put(o)
      // Keep newest MAX_PENDING
      val trimmed = JSONArray()
      val start = (arr.length() - MAX_PENDING).coerceAtLeast(0)
      for (i in start until arr.length()) {
        trimmed.put(arr.get(i))
      }
      prefs.edit().putString(KEY_PENDING, trimmed.toString()).apply()
    } catch (_: Exception) {
    }
  }

  private fun queryLatestId(): Long {
    if (!hasReadPermission()) return -1L
    val uri = Telephony.Sms.Inbox.CONTENT_URI
    var cursor: Cursor? = null
    try {
      cursor =
        reactContext.contentResolver.query(
          uri,
          arrayOf(Telephony.Sms._ID),
          null,
          null,
          "${Telephony.Sms._ID} DESC LIMIT 1"
        )
      if (cursor != null && cursor.moveToFirst()) {
        return cursor.getLong(0)
      }
    } catch (_: Exception) {
    } finally {
      cursor?.close()
    }
    return -1L
  }

  private fun queryInbox(limit: Int, minDate: Long): WritableArray {
    val projection =
      arrayOf(
        Telephony.Sms._ID,
        Telephony.Sms.ADDRESS,
        Telephony.Sms.BODY,
        Telephony.Sms.DATE
      )

    val selection: String?
    val selectionArgs: Array<String>?
    if (minDate > 0L) {
      selection = "${Telephony.Sms.DATE} >= ?"
      selectionArgs = arrayOf(minDate.toString())
    } else {
      selection = null
      selectionArgs = null
    }

    // Never put LIMIT in sortOrder — many OEMs reject or return empty for
    // Telephony provider when sortOrder is not a pure ORDER BY clause.
    val sortOrder = "${Telephony.Sms.DATE} DESC"
    val uri: Uri = Telephony.Sms.Inbox.CONTENT_URI
    var cursor: Cursor? = null
    val results: WritableArray = Arguments.createArray()
    val maxRows = limit.coerceIn(1, 2000)

    try {
      cursor =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          val args = android.os.Bundle()
          if (selection != null) {
            args.putString(android.content.ContentResolver.QUERY_ARG_SQL_SELECTION, selection)
            args.putStringArray(
              android.content.ContentResolver.QUERY_ARG_SQL_SELECTION_ARGS,
              selectionArgs
            )
          }
          args.putString(
            android.content.ContentResolver.QUERY_ARG_SQL_SORT_ORDER,
            sortOrder
          )
          args.putInt(android.content.ContentResolver.QUERY_ARG_LIMIT, maxRows)
          reactContext.contentResolver.query(uri, projection, args, null)
        } else {
          reactContext.contentResolver.query(
            uri,
            projection,
            selection,
            selectionArgs,
            sortOrder
          )
        }
      if (cursor != null) {
        val idxAddress = cursor.getColumnIndex(Telephony.Sms.ADDRESS)
        val idxBody = cursor.getColumnIndex(Telephony.Sms.BODY)
        val idxDate = cursor.getColumnIndex(Telephony.Sms.DATE)
        val idxId = cursor.getColumnIndex(Telephony.Sms._ID)

        var count = 0
        while (cursor.moveToNext() && count < maxRows) {
          val map: WritableMap = Arguments.createMap()
          map.putString(
            "id",
            if (idxId >= 0) cursor.getString(idxId) else null
          )
          map.putString(
            "address",
            if (idxAddress >= 0) cursor.getString(idxAddress) else null
          )
          map.putString(
            "body",
            if (idxBody >= 0) cursor.getString(idxBody) else ""
          )
          map.putDouble(
            "dateMs",
            if (idxDate >= 0) cursor.getLong(idxDate).toDouble() else 0.0
          )
          results.pushMap(map)
          count++
        }
      }
    } finally {
      cursor?.close()
    }
    return results
  }
}
