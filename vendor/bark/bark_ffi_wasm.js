/* @ts-self-types="./bark_ffi_wasm.d.ts" */

export class IntoUnderlyingByteSource {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        IntoUnderlyingByteSourceFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_intounderlyingbytesource_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get autoAllocateChunkSize() {
        const ret = wasm.intounderlyingbytesource_autoAllocateChunkSize(this.__wbg_ptr);
        return ret >>> 0;
    }
    cancel() {
        const ptr = this.__destroy_into_raw();
        wasm.intounderlyingbytesource_cancel(ptr);
    }
    /**
     * @param {ReadableByteStreamController} controller
     * @returns {Promise<any>}
     */
    pull(controller) {
        const ret = wasm.intounderlyingbytesource_pull(this.__wbg_ptr, addHeapObject(controller));
        return takeObject(ret);
    }
    /**
     * @param {ReadableByteStreamController} controller
     */
    start(controller) {
        wasm.intounderlyingbytesource_start(this.__wbg_ptr, addHeapObject(controller));
    }
    /**
     * @returns {ReadableStreamType}
     */
    get type() {
        const ret = wasm.intounderlyingbytesource_type(this.__wbg_ptr);
        return __wbindgen_enum_ReadableStreamType[ret];
    }
}
if (Symbol.dispose) IntoUnderlyingByteSource.prototype[Symbol.dispose] = IntoUnderlyingByteSource.prototype.free;

export class IntoUnderlyingSink {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        IntoUnderlyingSinkFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_intounderlyingsink_free(ptr, 0);
    }
    /**
     * @param {any} reason
     * @returns {Promise<any>}
     */
    abort(reason) {
        const ptr = this.__destroy_into_raw();
        const ret = wasm.intounderlyingsink_abort(ptr, addHeapObject(reason));
        return takeObject(ret);
    }
    /**
     * @returns {Promise<any>}
     */
    close() {
        const ptr = this.__destroy_into_raw();
        const ret = wasm.intounderlyingsink_close(ptr);
        return takeObject(ret);
    }
    /**
     * @param {any} chunk
     * @returns {Promise<any>}
     */
    write(chunk) {
        const ret = wasm.intounderlyingsink_write(this.__wbg_ptr, addHeapObject(chunk));
        return takeObject(ret);
    }
}
if (Symbol.dispose) IntoUnderlyingSink.prototype[Symbol.dispose] = IntoUnderlyingSink.prototype.free;

export class IntoUnderlyingSource {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        IntoUnderlyingSourceFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_intounderlyingsource_free(ptr, 0);
    }
    cancel() {
        const ptr = this.__destroy_into_raw();
        wasm.intounderlyingsource_cancel(ptr);
    }
    /**
     * @param {ReadableStreamDefaultController} controller
     * @returns {Promise<any>}
     */
    pull(controller) {
        const ret = wasm.intounderlyingsource_pull(this.__wbg_ptr, addHeapObject(controller));
        return takeObject(ret);
    }
}
if (Symbol.dispose) IntoUnderlyingSource.prototype[Symbol.dispose] = IntoUnderlyingSource.prototype.free;

/**
 * Pull-based notification handle exposed to JS.
 *
 * Obtain via `wallet.notifications()`. Loop on `await notif.nextNotification()`.
 * Each call to `wallet.notifications()` creates an independent stream — existing
 * holders are unaffected.
 *
 * Single-consumer per holder: concurrent `nextNotification()` calls reject with
 * an `Internal` error.
 */
export class NotificationHolder {
    static __wrap(ptr) {
        const obj = Object.create(NotificationHolder.prototype);
        obj.__wbg_ptr = ptr;
        NotificationHolderFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        NotificationHolderFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_notificationholder_free(ptr, 0);
    }
    /**
     * Cancel the currently pending `nextNotification()` wait.
     *
     * Causes a blocked `nextNotification()` to resolve to `null`. Does NOT
     * destroy the underlying stream — a subsequent call resumes normally.
     */
    cancelNextNotificationWait() {
        wasm.notificationholder_cancelNextNotificationWait(this.__wbg_ptr);
    }
    /**
     * Wait for the next wallet notification.
     *
     * Resolves to a `WalletNotification` object, or `null` if:
     * - `cancelNextNotificationWait()` was called while pending, or
     * - the wallet's notification source was shut down.
     * @returns {Promise<WalletNotification | undefined>}
     */
    nextNotification() {
        const ret = wasm.notificationholder_nextNotification(this.__wbg_ptr);
        return takeObject(ret);
    }
}
if (Symbol.dispose) NotificationHolder.prototype[Symbol.dispose] = NotificationHolder.prototype.free;

export class OnchainWallet {
    static __wrap(ptr) {
        const obj = Object.create(OnchainWallet.prototype);
        obj.__wbg_ptr = ptr;
        OnchainWalletFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        OnchainWalletFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_onchainwallet_free(ptr, 0);
    }
    /**
     * @returns {Promise<OnchainBalance>}
     */
    balance() {
        const ret = wasm.onchainwallet_balance(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * Open (or create) the onchain wallet against an IndexedDB-backed persister.
     * @param {OnchainWalletDefaultArgs} args
     * @returns {Promise<OnchainWallet>}
     */
    static default(args) {
        const ret = wasm.onchainwallet_default(addHeapObject(args));
        return takeObject(ret);
    }
    /**
     * Mark a wallet-known transaction as evicted from the mempool, so its
     * inputs return to coin selection immediately. Only for a tx that has
     * definitively been superseded on-chain (e.g. an RBF-replaced exit CPFP);
     * evicting a still-in-flight tx invites a self-inflicted double-spend.
     * @param {string} txid
     * @returns {Promise<void>}
     */
    evictTx(txid) {
        const ptr0 = passStringToWasm0(txid, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.onchainwallet_evictTx(this.__wbg_ptr, ptr0, len0);
        return takeObject(ret);
    }
    /**
     * Cached network fee-rate estimates from the wallet's chain source.
     * @returns {Promise<FeeRates>}
     */
    feeRates() {
        const ret = wasm.onchainwallet_feeRates(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * Discover the wallet's pre-existing on-chain history. Run once after
     * restoring a wallet from a mnemonic: `sync` only covers addresses this
     * wallet instance has already revealed, so it never finds transactions
     * made by a previous incarnation. Gap-limited full scan on esplora
     * (`birthdayHeight` is ignored there), block scan from `birthdayHeight`
     * on bitcoind. Returns the total balance in sats afterwards.
     * @param {number | null} [birthdayHeight]
     * @returns {Promise<number>}
     */
    initialScan(birthdayHeight) {
        const ret = wasm.onchainwallet_initialScan(this.__wbg_ptr, isLikeNone(birthdayHeight) ? Number.MAX_SAFE_INTEGER : (birthdayHeight) >>> 0);
        return takeObject(ret);
    }
    /**
     * @returns {Promise<string>}
     */
    newAddress() {
        const ret = wasm.onchainwallet_newAddress(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @param {string} address
     * @param {number} amountSats
     * @param {number} feeRateSatPerVb
     * @returns {Promise<string>}
     */
    send(address, amountSats, feeRateSatPerVb) {
        const ptr0 = passStringToWasm0(address, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.onchainwallet_send(this.__wbg_ptr, ptr0, len0, amountSats, feeRateSatPerVb);
        return takeObject(ret);
    }
    /**
     * @returns {Promise<number>}
     */
    sync() {
        const ret = wasm.onchainwallet_sync(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * Current chain tip height from the wallet's chain source.
     * @returns {Promise<number>}
     */
    tipHeight() {
        const ret = wasm.onchainwallet_tipHeight(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * Every wallet transaction with fee, balance change, confirmation and
     * CPFP flag. Requires a prior `sync` to be meaningful.
     * @returns {Promise<WalletTransaction[]>}
     */
    transactions() {
        const ret = wasm.onchainwallet_transactions(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * The wallet's unspent outputs. Requires a prior `sync` to be meaningful.
     * @returns {Promise<OnchainUtxo[]>}
     */
    utxos() {
        const ret = wasm.onchainwallet_utxos(this.__wbg_ptr);
        return takeObject(ret);
    }
}
if (Symbol.dispose) OnchainWallet.prototype[Symbol.dispose] = OnchainWallet.prototype.free;

export class Wallet {
    static __wrap(ptr) {
        const obj = Object.create(Wallet.prototype);
        obj.__wbg_ptr = ptr;
        WalletFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WalletFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wallet_free(ptr, 0);
    }
    /**
     * @returns {Promise<number | undefined>}
     */
    allExitsClaimableAtHeight() {
        const ret = wasm.wallet_allExitsClaimableAtHeight(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @returns {Promise<Vtxo[]>}
     */
    allVtxos() {
        const ret = wasm.wallet_allVtxos(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @param {string} paymentHash
     * @returns {Promise<void>}
     */
    allowLightningSendToExit(paymentHash) {
        const ptr0 = passStringToWasm0(paymentHash, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wallet_allowLightningSendToExit(this.__wbg_ptr, ptr0, len0);
        return takeObject(ret);
    }
    /**
     * @returns {Promise<ArkInfo | undefined>}
     */
    arkInfo() {
        const ret = wasm.wallet_arkInfo(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @param {string} paymentHash
     * @returns {Promise<void>}
     */
    attemptLightningReceiveExit(paymentHash) {
        const ptr0 = passStringToWasm0(paymentHash, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wallet_attemptLightningReceiveExit(this.__wbg_ptr, ptr0, len0);
        return takeObject(ret);
    }
    /**
     * @returns {Promise<Balance>}
     */
    balance() {
        const ret = wasm.wallet_balance(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @returns {Promise<PendingBoard>}
     */
    boardAll() {
        const ret = wasm.wallet_boardAll(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @param {number} amountSats
     * @returns {Promise<PendingBoard>}
     */
    boardAmount(amountSats) {
        const ret = wasm.wallet_boardAmount(this.__wbg_ptr, amountSats);
        return takeObject(ret);
    }
    /**
     * @returns {Promise<BoardFundingInfo>}
     */
    boardFundingAddress() {
        const ret = wasm.wallet_boardFundingAddress(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @param {string} psbtBase64
     * @param {number} keypairIndex
     * @param {number} expiryHeight
     * @returns {Promise<PendingBoard>}
     */
    boardPsbt(psbtBase64, keypairIndex, expiryHeight) {
        const ptr0 = passStringToWasm0(psbtBase64, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wallet_boardPsbt(this.__wbg_ptr, ptr0, len0, keypairIndex, expiryHeight);
        return takeObject(ret);
    }
    /**
     * @param {Bolt11InvoiceArgs} args
     * @returns {Promise<LightningInvoice>}
     */
    bolt11Invoice(args) {
        const ret = wasm.wallet_bolt11Invoice(this.__wbg_ptr, addHeapObject(args));
        return takeObject(ret);
    }
    /**
     * Create an invoice whose claimed VTXO is delivered to `claimDestination`
     * (an Ark address), letting that wallet receive while offline.
     *
     * The claim is signed directly to that address's own policy, so this wallet
     * has no custodial control and cannot redirect the payment. It can still
     * strand it: delivering the signed output to the destination's mailbox is a
     * separate step only this wallet can perform, and the recipient has no
     * independent way to recover the funds until it happens. Delivery resumes
     * automatically on restart, so a crash recovers on its own — but running
     * this for someone else means they trust you to stay online and eventually
     * deliver, not that they trust you with custody.
     *
     * A `claimDestination` owned by this wallet is claimed locally instead of
     * going through its mailbox.
     * @param {Bolt11InvoiceForAddressArgs} args
     * @returns {Promise<LightningInvoice>}
     */
    bolt11InvoiceForAddress(args) {
        const ret = wasm.wallet_bolt11InvoiceForAddress(this.__wbg_ptr, addHeapObject(args));
        return takeObject(ret);
    }
    /**
     * @param {string} txHex
     * @returns {Promise<string>}
     */
    broadcastTx(txHex) {
        const ptr0 = passStringToWasm0(txHex, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wallet_broadcastTx(this.__wbg_ptr, ptr0, len0);
        return takeObject(ret);
    }
    /**
     * @returns {Promise<void>}
     */
    cancelAllPendingRounds() {
        const ret = wasm.wallet_cancelAllPendingRounds(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @param {string} vtxoId
     * @returns {Promise<ExitCancelResult>}
     */
    cancelExit(vtxoId) {
        const ptr0 = passStringToWasm0(vtxoId, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wallet_cancelExit(this.__wbg_ptr, ptr0, len0);
        return takeObject(ret);
    }
    /**
     * @param {string} paymentHash
     * @returns {Promise<void>}
     */
    cancelLightningReceive(paymentHash) {
        const ptr0 = passStringToWasm0(paymentHash, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wallet_cancelLightningReceive(this.__wbg_ptr, ptr0, len0);
        return takeObject(ret);
    }
    /**
     * @param {number} roundId
     * @returns {Promise<void>}
     */
    cancelPendingRound(roundId) {
        const ret = wasm.wallet_cancelPendingRound(this.__wbg_ptr, roundId);
        return takeObject(ret);
    }
    /**
     * @param {CheckLightningPaymentArgs} args
     * @returns {Promise<LightningSendStatus>}
     */
    checkLightningPayment(args) {
        const ret = wasm.wallet_checkLightningPayment(this.__wbg_ptr, addHeapObject(args));
        return takeObject(ret);
    }
    /**
     * @returns {Promise<number>}
     */
    claimableLightningReceiveBalanceSats() {
        const ret = wasm.wallet_claimableLightningReceiveBalanceSats(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @returns {Config}
     */
    config() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.wallet_config(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return takeObject(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Low-level function to initialize a wallet
     *
     * You probably want to use [`Wallet::open`] instead.
     * @param {Network} network
     * @param {string} mnemonic_or_seed
     * @param {Config} config
     * @param {string | null | undefined} indexedDbName
     * @param {boolean} createWithoutServer
     * @returns {Promise<void>}
     */
    static create(network, mnemonic_or_seed, config, indexedDbName, createWithoutServer) {
        const ptr0 = passStringToWasm0(mnemonic_or_seed, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        var ptr1 = isLikeNone(indexedDbName) ? 0 : passStringToWasm0(indexedDbName, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        var len1 = WASM_VECTOR_LEN;
        const ret = wasm.wallet_create(addHeapObject(network), ptr0, len0, addHeapObject(config), ptr1, len1, createWithoutServer);
        return takeObject(ret);
    }
    /**
     * @param {DrainExitsArgs} args
     * @returns {Promise<ExitClaimTransaction>}
     */
    drainExits(args) {
        const ret = wasm.wallet_drainExits(this.__wbg_ptr, addHeapObject(args));
        return takeObject(ret);
    }
    /**
     * @param {number} amountSats
     * @returns {Promise<FeeEstimate>}
     */
    estimateArkoorPaymentFee(amountSats) {
        const ret = wasm.wallet_estimateArkoorPaymentFee(this.__wbg_ptr, amountSats);
        return takeObject(ret);
    }
    /**
     * @param {number} amountSats
     * @returns {Promise<FeeEstimate>}
     */
    estimateBoardFee(amountSats) {
        const ret = wasm.wallet_estimateBoardFee(this.__wbg_ptr, amountSats);
        return takeObject(ret);
    }
    /**
     * Estimate the onchain cost of unilaterally (emergency) exiting VTXOs.
     * Mirrors bark-rest `GET /exits/fee`.
     *
     * Pass an empty `vtxoIds` to price exiting the whole wallet (every
     * spendable VTXO). `feeRateSatPerVb` applies to both legs; omit it to use
     * the chain's fast rate for the broadcast leg and regular rate for the
     * claim leg. `destination` only affects the claim transaction's weight.
     *
     * The onchain wallet is synced first so `fundable` reflects the current
     * confirmed balance. Already-confirmed exit transactions cost nothing.
     * @param {string[]} vtxoIds
     * @param {number | null} [feeRateSatPerVb]
     * @param {string | null} [destination]
     * @returns {Promise<EmergencyExitFeeEstimate>}
     */
    estimateEmergencyExitFee(vtxoIds, feeRateSatPerVb, destination) {
        const ptr0 = passArrayJsValueToWasm0(vtxoIds, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        var ptr1 = isLikeNone(destination) ? 0 : passStringToWasm0(destination, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        var len1 = WASM_VECTOR_LEN;
        const ret = wasm.wallet_estimateEmergencyExitFee(this.__wbg_ptr, ptr0, len0, !isLikeNone(feeRateSatPerVb), isLikeNone(feeRateSatPerVb) ? 0 : feeRateSatPerVb, ptr1, len1);
        return takeObject(ret);
    }
    /**
     * @param {number} amountSats
     * @returns {Promise<FeeEstimate>}
     */
    estimateLightningReceiveFee(amountSats) {
        const ret = wasm.wallet_estimateLightningReceiveFee(this.__wbg_ptr, amountSats);
        return takeObject(ret);
    }
    /**
     * @param {number} amountSats
     * @returns {Promise<FeeEstimate>}
     */
    estimateLightningSendFee(amountSats) {
        const ret = wasm.wallet_estimateLightningSendFee(this.__wbg_ptr, amountSats);
        return takeObject(ret);
    }
    /**
     * @param {string} address
     * @returns {Promise<FeeEstimate>}
     */
    estimateOffboardAllFee(address) {
        const ptr0 = passStringToWasm0(address, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wallet_estimateOffboardAllFee(this.__wbg_ptr, ptr0, len0);
        return takeObject(ret);
    }
    /**
     * @param {string} address
     * @param {string[]} vtxoIds
     * @returns {Promise<FeeEstimate>}
     */
    estimateOffboardFee(address, vtxoIds) {
        const ptr0 = passStringToWasm0(address, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayJsValueToWasm0(vtxoIds, wasm.__wbindgen_export);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wallet_estimateOffboardFee(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        return takeObject(ret);
    }
    /**
     * @param {string[]} vtxoIds
     * @returns {Promise<FeeEstimate>}
     */
    estimateRefreshFee(vtxoIds) {
        const ptr0 = passArrayJsValueToWasm0(vtxoIds, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wallet_estimateRefreshFee(this.__wbg_ptr, ptr0, len0);
        return takeObject(ret);
    }
    /**
     * @param {string} address
     * @param {number} amountSats
     * @returns {Promise<FeeEstimate>}
     */
    estimateSendOnchainFee(address, amountSats) {
        const ptr0 = passStringToWasm0(address, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wallet_estimateSendOnchainFee(this.__wbg_ptr, ptr0, len0, amountSats);
        return takeObject(ret);
    }
    /**
     * @returns {string}
     */
    fingerprint() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.wallet_fingerprint(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export5(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {GetExitStatusArgs} args
     * @returns {Promise<ExitTransactionStatus | undefined>}
     */
    getExitStatus(args) {
        const ret = wasm.wallet_getExitStatus(this.__wbg_ptr, addHeapObject(args));
        return takeObject(ret);
    }
    /**
     * @returns {Promise<ExitVtxo[]>}
     */
    getExitVtxos() {
        const ret = wasm.wallet_getExitVtxos(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @param {number} thresholdBlocks
     * @returns {Promise<Vtxo[]>}
     */
    getExpiringVtxos(thresholdBlocks) {
        const ret = wasm.wallet_getExpiringVtxos(this.__wbg_ptr, thresholdBlocks);
        return takeObject(ret);
    }
    /**
     * @returns {Promise<number | undefined>}
     */
    getFirstExpiringVtxoBlockheight() {
        const ret = wasm.wallet_getFirstExpiringVtxoBlockheight(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @returns {Promise<number | undefined>}
     */
    getNextRequiredRefreshBlockheight() {
        const ret = wasm.wallet_getNextRequiredRefreshBlockheight(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @param {string} vtxoId
     * @returns {Promise<Vtxo>}
     */
    getVtxoById(vtxoId) {
        const ptr0 = passStringToWasm0(vtxoId, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wallet_getVtxoById(this.__wbg_ptr, ptr0, len0);
        return takeObject(ret);
    }
    /**
     * @returns {Promise<Vtxo[]>}
     */
    getVtxosToRefresh() {
        const ret = wasm.wallet_getVtxosToRefresh(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @returns {Promise<boolean>}
     */
    hasPendingExits() {
        const ret = wasm.wallet_hasPendingExits(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @returns {Promise<Movement[]>}
     */
    history() {
        const ret = wasm.wallet_history(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @param {string} paymentMethodType
     * @param {string} paymentMethodValue
     * @returns {Promise<Movement[]>}
     */
    historyByPaymentMethod(paymentMethodType, paymentMethodValue) {
        const ptr0 = passStringToWasm0(paymentMethodType, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(paymentMethodValue, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wallet_historyByPaymentMethod(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        return takeObject(ret);
    }
    /**
     * Import a VTXO from its serialized form (hex or base64).
     *
     * The VTXO is stored in the state the server reports for it, so one that
     * was already spent is recorded as spent rather than refused. Pass `args`
     * to widen the key-scan gap limit, skip the server status check, or allow
     * partial success; omit it for the defaults.
     * @param {string} encodedVtxo
     * @param {ImportVtxoArgs | null} [args]
     * @returns {Promise<void>}
     */
    importVtxo(encodedVtxo, args) {
        const ptr0 = passStringToWasm0(encodedVtxo, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wallet_importVtxo(this.__wbg_ptr, ptr0, len0, isLikeNone(args) ? 0 : addHeapObject(args));
        return takeObject(ret);
    }
    /**
     * Import several VTXOs (hex or base64) under a single key scan and a
     * single write, which is why this is not just a loop over `importVtxo`.
     *
     * Returns the ids now held — whether this call stored them or found them
     * already present — so a failed batch can be retried. One VTXO that cannot
     * be imported discards the whole batch unless `args.allowPartial` is set,
     * in which case the ones that did import are kept.
     * @param {string[]} encodedVtxos
     * @param {ImportVtxoArgs | null} [args]
     * @returns {Promise<string[]>}
     */
    importVtxos(encodedVtxos, args) {
        const ptr0 = passArrayJsValueToWasm0(encodedVtxos, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wallet_importVtxos(this.__wbg_ptr, ptr0, len0, isLikeNone(args) ? 0 : addHeapObject(args));
        return takeObject(ret);
    }
    /**
     * @param {string} paymentHash
     * @returns {Promise<boolean>}
     */
    isInvoicePaid(paymentHash) {
        const ptr0 = passStringToWasm0(paymentHash, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wallet_isInvoicePaid(this.__wbg_ptr, ptr0, len0);
        return takeObject(ret);
    }
    /**
     * Triage a payment hash: settled or in-progress. Errors if no lightning
     * receive is known for this payment hash.
     * @param {string} paymentHash
     * @returns {Promise<LightningReceive>}
     */
    lightningReceiveState(paymentHash) {
        const ptr0 = passStringToWasm0(paymentHash, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wallet_lightningReceiveState(this.__wbg_ptr, ptr0, len0);
        return takeObject(ret);
    }
    /**
     * @param {string} paymentHash
     * @returns {Promise<LightningSendStatus>}
     */
    lightningSendState(paymentHash) {
        const ptr0 = passStringToWasm0(paymentHash, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wallet_lightningSendState(this.__wbg_ptr, ptr0, len0);
        return takeObject(ret);
    }
    /**
     * @returns {Promise<ExitVtxo[]>}
     */
    listClaimableExits() {
        const ret = wasm.wallet_listClaimableExits(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @param {LockVtxosArgs} args
     * @returns {Promise<void>}
     */
    lockVtxos(args) {
        const ret = wasm.wallet_lockVtxos(this.__wbg_ptr, addHeapObject(args));
        return takeObject(ret);
    }
    /**
     * Create a hex-encoded authorization that lets whoever holds it read this
     * wallet's mailbox from the Ark server for `expirySecs` from now, so 86400
     * for 24 hours. An authorization cannot be revoked early, so keep the
     * window short.
     * @param {number} expirySecs
     * @returns {string}
     */
    mailboxAuthorization(expirySecs) {
        let deferred2_0;
        let deferred2_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.wallet_mailboxAuthorization(retptr, this.__wbg_ptr, expirySecs);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            var ptr1 = r0;
            var len1 = r1;
            if (r3) {
                ptr1 = 0; len1 = 0;
                throw takeObject(r2);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export5(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    mailboxIdentifier() {
        let deferred2_0;
        let deferred2_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.wallet_mailboxIdentifier(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            var ptr1 = r0;
            var len1 = r1;
            if (r3) {
                ptr1 = 0; len1 = 0;
                throw takeObject(r2);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export5(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * @returns {Promise<void>}
     */
    maintenance() {
        const ret = wasm.wallet_maintenance(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @returns {Promise<void>}
     */
    maintenanceDelegated() {
        const ret = wasm.wallet_maintenanceDelegated(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @returns {Promise<string | undefined>}
     */
    maintenanceRefresh() {
        const ret = wasm.wallet_maintenanceRefresh(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @returns {Promise<Network>}
     */
    network() {
        const ret = wasm.wallet_network(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @returns {Promise<string>}
     */
    newAddress() {
        const ret = wasm.wallet_newAddress(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @returns {Promise<AddressWithIndex>}
     */
    newAddressWithIndex() {
        const ret = wasm.wallet_newAddressWithIndex(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @returns {Promise<number>}
     */
    nextRoundStartTime() {
        const ret = wasm.wallet_nextRoundStartTime(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @returns {NotificationHolder}
     */
    notifications() {
        const ret = wasm.wallet_notifications(this.__wbg_ptr);
        return NotificationHolder.__wrap(ret);
    }
    /**
     * @param {string} bitcoinAddress
     * @returns {Promise<OffboardResult>}
     */
    offboardAll(bitcoinAddress) {
        const ptr0 = passStringToWasm0(bitcoinAddress, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wallet_offboardAll(this.__wbg_ptr, ptr0, len0);
        return takeObject(ret);
    }
    /**
     * @param {string[]} vtxoIds
     * @param {string} bitcoinAddress
     * @returns {Promise<OffboardResult>}
     */
    offboardVtxos(vtxoIds, bitcoinAddress) {
        const ptr0 = passArrayJsValueToWasm0(vtxoIds, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(bitcoinAddress, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wallet_offboardVtxos(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        return takeObject(ret);
    }
    /**
     * A handle to the onchain wallet this wallet was opened with, or
     * `undefined` if it was opened without one. The returned handle shares
     * the underlying bdk wallet with this wallet and must be `free()`d by the
     * caller when no longer needed.
     * @returns {OnchainWallet | undefined}
     */
    onchainWallet() {
        const ret = wasm.wallet_onchainWallet(this.__wbg_ptr);
        return ret === 0 ? undefined : OnchainWallet.__wrap(ret);
    }
    /**
     * Open a wallet, mirroring [`bark::Wallet::open`]: a single entry point
     * with everything optional. Set `createIfNotExists` to create the wallet
     * if it doesn't exist yet (replacing the old `create` constructor).
     *
     * The onchain wallet is supplied here at open time; onchain operations
     * (boarding, exits, ...) use it internally and no longer take it per-call.
     *
     * NOTE: passing `onchain` here CONSUMES the JS handle (wasm-bindgen moves
     * exported types passed by value): after this call its methods throw
     * `null pointer passed to rust`. Prefer `openWithOnchain`, which borrows
     * the handle and leaves it usable, or recover a fresh handle with
     * `onchainWallet()` after opening.
     * @param {Network} network
     * @param {string} mnemonic_or_seed
     * @param {Config} config
     * @param {OnchainWallet | null | undefined} onchain
     * @param {OpenWalletArgs} args
     * @returns {Promise<Wallet>}
     */
    static open(network, mnemonic_or_seed, config, onchain, args) {
        const ptr0 = passStringToWasm0(mnemonic_or_seed, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        let ptr1 = 0;
        if (!isLikeNone(onchain)) {
            _assertClass(onchain, OnchainWallet);
            ptr1 = onchain.__destroy_into_raw();
        }
        const ret = wasm.wallet_open(addHeapObject(network), ptr0, len0, addHeapObject(config), ptr1, addHeapObject(args));
        return takeObject(ret);
    }
    /**
     * Like [`Wallet::open`], but borrows the onchain wallet handle instead of
     * consuming it: the same `OnchainWallet` instance stays valid for
     * `balance()` / `newAddress()` / `send()` / `sync()`, and it and the
     * wallet share one underlying bdk wallet (no persister divergence).
     *
     * Both handles should still be `free()`d on teardown; each drop only
     * releases its own reference.
     * @param {Network} network
     * @param {string} mnemonic_or_seed
     * @param {Config} config
     * @param {OnchainWallet} onchain
     * @param {OpenWalletArgs} args
     * @returns {Promise<Wallet>}
     */
    static openWithOnchain(network, mnemonic_or_seed, config, onchain, args) {
        const ptr0 = passStringToWasm0(mnemonic_or_seed, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        _assertClass(onchain, OnchainWallet);
        const ret = wasm.wallet_openWithOnchain(addHeapObject(network), ptr0, len0, addHeapObject(config), onchain.__wbg_ptr, addHeapObject(args));
        return takeObject(ret);
    }
    /**
     * Pay to a Lightning Address (`user@domain`), resolved via LNURL-pay.
     *
     * The LNURL endpoint is fetched with the browser's `fetch`, so it must
     * allow cross-origin requests (and the page's CSP `connect-src` must
     * permit it).
     * @param {PayLightningAddressArgs} args
     * @returns {Promise<LightningSendStatus>}
     */
    payLightningAddress(args) {
        const ret = wasm.wallet_payLightningAddress(this.__wbg_ptr, addHeapObject(args));
        return takeObject(ret);
    }
    /**
     * @param {PayLightningInvoiceArgs} args
     * @returns {Promise<LightningSendStatus>}
     */
    payLightningInvoice(args) {
        const ret = wasm.wallet_payLightningInvoice(this.__wbg_ptr, addHeapObject(args));
        return takeObject(ret);
    }
    /**
     * @param {PayLightningOfferArgs} args
     * @returns {Promise<LightningSendStatus>}
     */
    payLightningOffer(args) {
        const ret = wasm.wallet_payLightningOffer(this.__wbg_ptr, addHeapObject(args));
        return takeObject(ret);
    }
    /**
     * Pay a raw LNURL-pay link (`lnurl1…`). Errors if the link decodes to a
     * non-pay LNURL (auth, withdraw, channel).
     *
     * Same cross-origin caveat as `payLightningAddress`.
     * @param {PayLnurlArgs} args
     * @returns {Promise<LightningSendStatus>}
     */
    payLnurl(args) {
        const ret = wasm.wallet_payLnurl(this.__wbg_ptr, addHeapObject(args));
        return takeObject(ret);
    }
    /**
     * @param {number} index
     * @returns {Promise<string>}
     */
    peekAddress(index) {
        const ret = wasm.wallet_peekAddress(this.__wbg_ptr, index);
        return takeObject(ret);
    }
    /**
     * @returns {Promise<Vtxo[]>}
     */
    pendingBoardVtxos() {
        const ret = wasm.wallet_pendingBoardVtxos(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @returns {Promise<PendingBoard[]>}
     */
    pendingBoards() {
        const ret = wasm.wallet_pendingBoards(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @returns {Promise<number>}
     */
    pendingExitsTotalSats() {
        const ret = wasm.wallet_pendingExitsTotalSats(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @returns {Promise<LightningReceive[]>}
     */
    pendingLightningReceives() {
        const ret = wasm.wallet_pendingLightningReceives(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @returns {Promise<Vtxo[]>}
     */
    pendingLightningSendVtxos() {
        const ret = wasm.wallet_pendingLightningSendVtxos(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @returns {Promise<LightningSend[]>}
     */
    pendingLightningSends() {
        const ret = wasm.wallet_pendingLightningSends(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @returns {Promise<Vtxo[]>}
     */
    pendingRoundInputVtxos() {
        const ret = wasm.wallet_pendingRoundInputVtxos(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @returns {Promise<RoundState[]>}
     */
    pendingRoundStates() {
        const ret = wasm.wallet_pendingRoundStates(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @param {ProgressExitsArgs} args
     * @returns {Promise<ExitProgressStatus[]>}
     */
    progressExits(args) {
        const ret = wasm.wallet_progressExits(this.__wbg_ptr, addHeapObject(args));
        return takeObject(ret);
    }
    /**
     * @returns {Promise<void>}
     */
    progressPendingRounds() {
        const ret = wasm.wallet_progressPendingRounds(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @returns {Promise<WalletProperties>}
     */
    properties() {
        const ret = wasm.wallet_properties(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * Recover the given VTXO ids from the server, importing the ones this
     * wallet owns that are still spendable. Use it to retry ids a previous scan
     * reported as `failed`.
     *
     * `gapLimit` overrides `vtxoKeyGapLimit` from the wallet config for the key
     * scan that decides which of `vtxoIds` this wallet owns. Widen it to reach
     * ids a previous scan bucketed as `foreign`.
     * @param {string[]} vtxoIds
     * @param {number | null} [gapLimit]
     * @returns {Promise<RecoveryReport>}
     */
    recoverVtxos(vtxoIds, gapLimit) {
        const ptr0 = passArrayJsValueToWasm0(vtxoIds, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wallet_recoverVtxos(this.__wbg_ptr, ptr0, len0, isLikeNone(gapLimit) ? Number.MAX_SAFE_INTEGER : (gapLimit) >>> 0);
        return takeObject(ret);
    }
    /**
     * The report of the seed-recovery scan that ran during `open`, or
     * `undefined` if the scan did not complete. Use `recoveryStatus` to tell a
     * scan that failed apart from one that never ran.
     * @returns {RecoveryReport | undefined}
     */
    recoveryReport() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.wallet_recoveryReport(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return takeObject(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Outcome of the seed-recovery scan that ran during `open`.
     *
     * Recovery only runs on the open that creates the wallet locally, and not
     * at all when `skipRecovery` is set, so this is `not-run` on every
     * subsequent open. `failed` means the scan errored before producing a
     * report — bark logs that and lets open succeed — so funds may be missing
     * until a retry; `completed` carries the report, and `isComplete === false`
     * there means funds may still be missing. Retry the report's `failed` ids
     * with `recoverVtxos`.
     * @returns {RecoveryStatus}
     */
    recoveryStatus() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.wallet_recoveryStatus(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return takeObject(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * @returns {Promise<void>}
     */
    refreshServer() {
        const ret = wasm.wallet_refreshServer(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @param {string[]} vtxoIds
     * @returns {Promise<string | undefined>}
     */
    refreshVtxos(vtxoIds) {
        const ptr0 = passArrayJsValueToWasm0(vtxoIds, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wallet_refreshVtxos(this.__wbg_ptr, ptr0, len0);
        return takeObject(ret);
    }
    /**
     * @param {string[]} vtxoIds
     * @returns {Promise<RoundState | undefined>}
     */
    refreshVtxosDelegated(vtxoIds) {
        const ptr0 = passArrayJsValueToWasm0(vtxoIds, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wallet_refreshVtxosDelegated(this.__wbg_ptr, ptr0, len0);
        return takeObject(ret);
    }
    /**
     * Schedule a delegated refresh for `scheduledHeight` instead of the next
     * round. The refresh fee is priced against the VTXO's remaining lifetime at
     * that height, and the server charges less the closer a VTXO is to expiry,
     * so scheduling further out never costs more than refreshing now.
     * @param {string[]} vtxoIds
     * @param {number} scheduledHeight
     * @returns {Promise<RoundState | undefined>}
     */
    refreshVtxosScheduled(vtxoIds, scheduledHeight) {
        const ptr0 = passArrayJsValueToWasm0(vtxoIds, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wallet_refreshVtxosScheduled(this.__wbg_ptr, ptr0, len0, scheduledHeight);
        return takeObject(ret);
    }
    /**
     * Start the background daemon, which drives mailbox messages, round
     * events, server-connection checks and periodic syncs.
     *
     * Only needed when the wallet was opened with `runDaemon: false`; opening
     * with the default already starts it. Calling this while the daemon is
     * already running is a no-op.
     */
    runDaemon() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.wallet_runDaemon(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            if (r1) {
                throw takeObject(r0);
            }
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * @param {string} arkAddress
     * @param {number} amountSats
     * @returns {Promise<void>}
     */
    sendArkoorPayment(arkAddress, amountSats) {
        const ptr0 = passStringToWasm0(arkAddress, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wallet_sendArkoorPayment(this.__wbg_ptr, ptr0, len0, amountSats);
        return takeObject(ret);
    }
    /**
     * @param {string} address
     * @param {number} amountSats
     * @returns {Promise<string>}
     */
    sendOnchain(address, amountSats) {
        const ptr0 = passStringToWasm0(address, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wallet_sendOnchain(this.__wbg_ptr, ptr0, len0, amountSats);
        return takeObject(ret);
    }
    /**
     * @param {string} psbtBase64
     * @returns {Promise<string>}
     */
    signExitClaimInputs(psbtBase64) {
        const ptr0 = passStringToWasm0(psbtBase64, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wallet_signExitClaimInputs(this.__wbg_ptr, ptr0, len0);
        return takeObject(ret);
    }
    /**
     * @returns {Promise<Vtxo[]>}
     */
    spendableVtxos() {
        const ret = wasm.wallet_spendableVtxos(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @returns {Promise<void>}
     */
    startExitForEntireWallet() {
        const ret = wasm.wallet_startExitForEntireWallet(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @param {string[]} vtxoIds
     * @returns {Promise<void>}
     */
    startExitForVtxos(vtxoIds) {
        const ptr0 = passArrayJsValueToWasm0(vtxoIds, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wallet_startExitForVtxos(this.__wbg_ptr, ptr0, len0);
        return takeObject(ret);
    }
    /**
     * @param {string[]} vtxoIds
     * @returns {Promise<void>}
     */
    startExitForVtxosIncludingNonStandard(vtxoIds) {
        const ptr0 = passArrayJsValueToWasm0(vtxoIds, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wallet_startExitForVtxosIncludingNonStandard(this.__wbg_ptr, ptr0, len0);
        return takeObject(ret);
    }
    /**
     * Stop the background daemon. A no-op when it isn't running.
     *
     * Nothing drives the mailbox afterwards: call `sync` (or restart the
     * daemon) to pick up incoming payments.
     *
     * This also happens automatically on `free()`.
     */
    stopDaemon() {
        wasm.wallet_stopDaemon(this.__wbg_ptr);
    }
    /**
     * Stop the background daemon and wait until its tasks have finished, so
     * nothing runs in the background afterwards (e.g. before deleting the
     * wallet's database). No-op when no daemon is running.
     * @returns {Promise<void>}
     */
    stopDaemonWait() {
        const ret = wasm.wallet_stopDaemonWait(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @returns {Promise<LightningSend[]>}
     */
    stuckFailedLightningSends() {
        const ret = wasm.wallet_stuckFailedLightningSends(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @returns {Promise<void>}
     */
    sync() {
        const ret = wasm.wallet_sync(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @returns {Promise<void>}
     */
    syncExits() {
        const ret = wasm.wallet_syncExits(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * Scan for VTXOs that were force-exited on-chain without the user asking
     * and route them into the unilateral-exit flow so the funds can be claimed.
     * This already runs automatically as part of `sync`.
     * @returns {Promise<void>}
     */
    syncForceExitedVtxos() {
        const ret = wasm.wallet_syncForceExitedVtxos(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @returns {Promise<void>}
     */
    syncPendingBoards() {
        const ret = wasm.wallet_syncPendingBoards(this.__wbg_ptr);
        return takeObject(ret);
    }
    /**
     * @param {TryClaimAllLightningReceivesArgs} args
     * @returns {Promise<LightningReceive[]>}
     */
    tryClaimAllLightningReceives(args) {
        const ret = wasm.wallet_tryClaimAllLightningReceives(this.__wbg_ptr, addHeapObject(args));
        return takeObject(ret);
    }
    /**
     * @param {TryClaimLightningReceiveArgs} args
     * @returns {Promise<LightningReceive>}
     */
    tryClaimLightningReceive(args) {
        const ret = wasm.wallet_tryClaimLightningReceive(this.__wbg_ptr, addHeapObject(args));
        return takeObject(ret);
    }
    /**
     * @param {UnlockVtxosArgs} args
     * @returns {Promise<void>}
     */
    unlockVtxos(args) {
        const ret = wasm.wallet_unlockVtxos(this.__wbg_ptr, addHeapObject(args));
        return takeObject(ret);
    }
    /**
     * Whether this wallet can pay `address` out-of-round: same network and
     * server, a supported VTXO policy, and only delivery mechanisms this bark
     * supports. An address listing no delivery mechanism is valid. Throws only
     * when the address does not parse.
     * @param {string} address
     * @returns {Promise<boolean>}
     */
    validateArkoorAddress(address) {
        const ptr0 = passStringToWasm0(address, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wallet_validateArkoorAddress(this.__wbg_ptr, ptr0, len0);
        return takeObject(ret);
    }
    /**
     * Hex-encoded serialization of the full VTXO (genesis chain included),
     * re-importable via `importVtxo`. Mirrors bark-rest `GET /vtxos/{id}/encoded`.
     * @param {string} vtxoId
     * @returns {Promise<string>}
     */
    vtxoEncoded(vtxoId) {
        const ptr0 = passStringToWasm0(vtxoId, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wallet_vtxoEncoded(this.__wbg_ptr, ptr0, len0);
        return takeObject(ret);
    }
    /**
     * @returns {Promise<Vtxo[]>}
     */
    vtxos() {
        const ret = wasm.wallet_vtxos(this.__wbg_ptr);
        return takeObject(ret);
    }
}
if (Symbol.dispose) Wallet.prototype[Symbol.dispose] = Wallet.prototype.free;

/**
 * @returns {number}
 */
export function defaultVtxoKeyGapLimit() {
    const ret = wasm.defaultVtxoKeyGapLimit();
    return ret >>> 0;
}

/**
 * @param {string} psbtBase64
 * @returns {string}
 */
export function extractTxFromPsbt(psbtBase64) {
    let deferred3_0;
    let deferred3_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(psbtBase64, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        wasm.extractTxFromPsbt(retptr, ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
        var ptr2 = r0;
        var len2 = r1;
        if (r3) {
            ptr2 = 0; len2 = 0;
            throw takeObject(r2);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export5(deferred3_0, deferred3_1, 1);
    }
}

/**
 * @returns {string}
 */
export function generateMnemonic() {
    let deferred2_0;
    let deferred2_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.generateMnemonic(retptr);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
        var ptr1 = r0;
        var len1 = r1;
        if (r3) {
            ptr1 = 0; len1 = 0;
            throw takeObject(r2);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export5(deferred2_0, deferred2_1, 1);
    }
}

/**
 * @returns {number}
 */
export function maxVtxoKeyGapLimit() {
    const ret = wasm.maxVtxoKeyGapLimit();
    return ret >>> 0;
}

/**
 * @param {string} address
 * @returns {boolean}
 */
export function validateArkAddress(address) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(address, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        wasm.validateArkAddress(retptr, ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        if (r2) {
            throw takeObject(r1);
        }
        return r0 !== 0;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * @param {string} mnemonic
 * @returns {boolean}
 */
export function validateMnemonic(mnemonic) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(mnemonic, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        wasm.validateMnemonic(retptr, ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        if (r2) {
            throw takeObject(r1);
        }
        return r0 !== 0;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_408e67f47ca7b58b: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return addHeapObject(ret);
        },
        __wbg_Number_3890faa6d3ff057d: function(arg0) {
            const ret = Number(getObject(arg0));
            return ret;
        },
        __wbg_String_8564e559799eccda: function(arg0, arg1) {
            const ret = String(getObject(arg1));
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_bigint_get_as_i64_c4ecf48528083721: function(arg0, arg1) {
            const v = getObject(arg1);
            const ret = typeof(v) === 'bigint' ? v : undefined;
            getDataViewMemory0().setBigInt64(arg0 + 8 * 1, isLikeNone(ret) ? BigInt(0) : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_boolean_get_c9c83ebd41b34df3: function(arg0) {
            const v = getObject(arg0);
            const ret = typeof(v) === 'boolean' ? v : undefined;
            return isLikeNone(ret) ? 0xFFFFFF : ret ? 1 : 0;
        },
        __wbg___wbindgen_debug_string_a57024b9c6e4a48b: function(arg0, arg1) {
            const ret = debugString(getObject(arg1));
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_in_ac983077f137f2e6: function(arg0, arg1) {
            const ret = getObject(arg0) in getObject(arg1);
            return ret;
        },
        __wbg___wbindgen_is_bigint_8ffbbef442139384: function(arg0) {
            const ret = typeof(getObject(arg0)) === 'bigint';
            return ret;
        },
        __wbg___wbindgen_is_function_5e4570eb24ffa122: function(arg0) {
            const ret = typeof(getObject(arg0)) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_null_7d13f41e1a2d5140: function(arg0) {
            const ret = getObject(arg0) === null;
            return ret;
        },
        __wbg___wbindgen_is_object_a2790eb24c211ea0: function(arg0) {
            const val = getObject(arg0);
            const ret = typeof(val) === 'object' && val !== null;
            return ret;
        },
        __wbg___wbindgen_is_string_e6f02f0ea5f20a32: function(arg0) {
            const ret = typeof(getObject(arg0)) === 'string';
            return ret;
        },
        __wbg___wbindgen_is_undefined_6cff064c44e0d823: function(arg0) {
            const ret = getObject(arg0) === undefined;
            return ret;
        },
        __wbg___wbindgen_jsval_eq_0a18949a61670320: function(arg0, arg1) {
            const ret = getObject(arg0) === getObject(arg1);
            return ret;
        },
        __wbg___wbindgen_jsval_loose_eq_acf2776254a8d832: function(arg0, arg1) {
            const ret = getObject(arg0) == getObject(arg1);
            return ret;
        },
        __wbg___wbindgen_number_get_136b9679cab35cfb: function(arg0, arg1) {
            const obj = getObject(arg1);
            const ret = typeof(obj) === 'number' ? obj : undefined;
            getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_string_get_d154f1e671052120: function(arg0, arg1) {
            const obj = getObject(arg1);
            const ret = typeof(obj) === 'string' ? obj : undefined;
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_throw_bb96b2010945f0bc: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg__wbg_cb_unref_be22cc64ae6946a0: function(arg0) {
            getObject(arg0)._wbg_cb_unref();
        },
        __wbg_abort_1254fe4ac5695dc0: function(arg0, arg1) {
            getObject(arg0).abort(getObject(arg1));
        },
        __wbg_abort_32b500c4f9eab55d: function() { return handleError(function (arg0) {
            getObject(arg0).abort();
        }, arguments); },
        __wbg_abort_d8615b5857e112b3: function(arg0) {
            getObject(arg0).abort();
        },
        __wbg_advance_dccae0cf09e24797: function() { return handleError(function (arg0, arg1) {
            getObject(arg0).advance(arg1 >>> 0);
        }, arguments); },
        __wbg_append_acad6a3f39a3e778: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
            getObject(arg0).append(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4));
        }, arguments); },
        __wbg_arrayBuffer_16433f17fbd74397: function() { return handleError(function (arg0) {
            const ret = getObject(arg0).arrayBuffer();
            return addHeapObject(ret);
        }, arguments); },
        __wbg_body_eb2e7e7701fa47ae: function(arg0) {
            const ret = getObject(arg0).body;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        },
        __wbg_bound_e48dc2f851c77207: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            const ret = IDBKeyRange.bound(getObject(arg0), getObject(arg1), arg2 !== 0, arg3 !== 0);
            return addHeapObject(ret);
        }, arguments); },
        __wbg_buffer_78291c0e094ccf99: function(arg0) {
            const ret = getObject(arg0).buffer;
            return addHeapObject(ret);
        },
        __wbg_byobRequest_f8b1c89429b77545: function(arg0) {
            const ret = getObject(arg0).byobRequest;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        },
        __wbg_byteLength_336bc7d303511ba0: function(arg0) {
            const ret = getObject(arg0).byteLength;
            return ret;
        },
        __wbg_byteOffset_2b1d5b10453ce198: function(arg0) {
            const ret = getObject(arg0).byteOffset;
            return ret;
        },
        __wbg_call_1c5886ab9c57d1c7: function() { return handleError(function (arg0, arg1) {
            const ret = getObject(arg0).call(getObject(arg1));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_call_35dba3c747ad7521: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = getObject(arg0).call(getObject(arg1), getObject(arg2));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_call_39f824e18d9d2414: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
            const ret = getObject(arg0).call(getObject(arg1), getObject(arg2), getObject(arg3), getObject(arg4));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_cancel_9610ed0dbe990e64: function(arg0) {
            const ret = getObject(arg0).cancel();
            return addHeapObject(ret);
        },
        __wbg_catch_8094577c3f159ad5: function(arg0, arg1) {
            const ret = getObject(arg0).catch(getObject(arg1));
            return addHeapObject(ret);
        },
        __wbg_clearTimeout_113b1cde814ec762: function(arg0) {
            const ret = clearTimeout(takeObject(arg0));
            return addHeapObject(ret);
        },
        __wbg_clearTimeout_6b8d9a38b9263d65: function(arg0) {
            const ret = clearTimeout(takeObject(arg0));
            return addHeapObject(ret);
        },
        __wbg_clearTimeout_c122f92fd48cd749: function(arg0) {
            const ret = clearTimeout(takeObject(arg0));
            return addHeapObject(ret);
        },
        __wbg_close_0c1f30aeb9a080a7: function(arg0) {
            getObject(arg0).close();
        },
        __wbg_close_72f69f5f2de2bc73: function() { return handleError(function (arg0) {
            getObject(arg0).close();
        }, arguments); },
        __wbg_close_97cdb44c3a7878f6: function() { return handleError(function (arg0) {
            getObject(arg0).close();
        }, arguments); },
        __wbg_createIndex_f8a090296c419c6c: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
            const ret = getObject(arg0).createIndex(getStringFromWasm0(arg1, arg2), getObject(arg3), getObject(arg4));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_createObjectStore_2ddc8f74181944c1: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            const ret = getObject(arg0).createObjectStore(getStringFromWasm0(arg1, arg2), getObject(arg3));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_crypto_38df2bab126b63dc: function(arg0) {
            const ret = getObject(arg0).crypto;
            return addHeapObject(ret);
        },
        __wbg_delete_27b012593b3f623b: function() { return handleError(function (arg0, arg1) {
            const ret = getObject(arg0).delete(getObject(arg1));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_done_669171204c3dcae2: function(arg0) {
            const ret = getObject(arg0).done;
            return ret;
        },
        __wbg_enqueue_7d68a21eda78e72f: function() { return handleError(function (arg0, arg1) {
            getObject(arg0).enqueue(getObject(arg1));
        }, arguments); },
        __wbg_entries_7774d489e1da5f4f: function(arg0) {
            const ret = Object.entries(getObject(arg0));
            return addHeapObject(ret);
        },
        __wbg_error_24e6ac605d438e54: function() { return handleError(function (arg0) {
            const ret = getObject(arg0).error;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        }, arguments); },
        __wbg_fetch_5e2e4a3d60c8d1d3: function(arg0, arg1) {
            const ret = fetch(getObject(arg0), getObject(arg1));
            return addHeapObject(ret);
        },
        __wbg_fetch_75234d52fb417eb2: function(arg0, arg1, arg2) {
            const ret = getObject(arg0).fetch(getObject(arg1), getObject(arg2));
            return addHeapObject(ret);
        },
        __wbg_fetch_9dad4fe911207b37: function(arg0) {
            const ret = fetch(getObject(arg0));
            return addHeapObject(ret);
        },
        __wbg_fetch_d752d93f5b259503: function(arg0, arg1) {
            const ret = getObject(arg0).fetch(getObject(arg1));
            return addHeapObject(ret);
        },
        __wbg_getAll_358f5970d9bee84b: function() { return handleError(function (arg0) {
            const ret = getObject(arg0).getAll();
            return addHeapObject(ret);
        }, arguments); },
        __wbg_getAll_c69c6c843796f334: function() { return handleError(function (arg0, arg1) {
            const ret = getObject(arg0).getAll(getObject(arg1));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_getAll_edf30bc7f595e7ae: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = getObject(arg0).getAll(getObject(arg1), arg2 >>> 0);
            return addHeapObject(ret);
        }, arguments); },
        __wbg_getRandomValues_436a51d0629d84e1: function() { return handleError(function (arg0, arg1) {
            globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1));
        }, arguments); },
        __wbg_getRandomValues_a608c4436c19407a: function() { return handleError(function (arg0, arg1) {
            globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1));
        }, arguments); },
        __wbg_getRandomValues_c44a50d8cfdaebeb: function() { return handleError(function (arg0, arg1) {
            getObject(arg0).getRandomValues(getObject(arg1));
        }, arguments); },
        __wbg_getReader_9facd4f899beac89: function() { return handleError(function (arg0) {
            const ret = getObject(arg0).getReader();
            return addHeapObject(ret);
        }, arguments); },
        __wbg_getTime_63fb0332e6c4ec17: function(arg0) {
            const ret = getObject(arg0).getTime();
            return ret;
        },
        __wbg_getTimezoneOffset_4baa793e0d3962a8: function(arg0) {
            const ret = getObject(arg0).getTimezoneOffset();
            return ret;
        },
        __wbg_get_4babbbf9303c1945: function() { return handleError(function (arg0, arg1) {
            const ret = getObject(arg0).get(getObject(arg1));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_get_8caf461d5632abc2: function(arg0, arg1, arg2) {
            const ret = getObject(arg1)[arg2 >>> 0];
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_get_971a0c45d172643f: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.get(getObject(arg0), getObject(arg1));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_get_c0c8f8d7da0c03dd: function(arg0, arg1) {
            const ret = getObject(arg0)[arg1 >>> 0];
            return addHeapObject(ret);
        },
        __wbg_get_d173c0308df22d37: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.get(getObject(arg0), getObject(arg1));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_get_done_ce5b5691b59c07f2: function(arg0) {
            const ret = getObject(arg0).done;
            return isLikeNone(ret) ? 0xFFFFFF : ret ? 1 : 0;
        },
        __wbg_get_unchecked_e20b893aeafc3fca: function(arg0, arg1) {
            const ret = getObject(arg0)[arg1 >>> 0];
            return addHeapObject(ret);
        },
        __wbg_get_value_58309ba057b715e1: function(arg0) {
            const ret = getObject(arg0).value;
            return addHeapObject(ret);
        },
        __wbg_get_with_ref_key_6412cf3094599694: function(arg0, arg1) {
            const ret = getObject(arg0)[getObject(arg1)];
            return addHeapObject(ret);
        },
        __wbg_has_b3a6e6d0d28295fa: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.has(getObject(arg0), getObject(arg1));
            return ret;
        }, arguments); },
        __wbg_headers_92567b07014384b9: function(arg0) {
            const ret = getObject(arg0).headers;
            return addHeapObject(ret);
        },
        __wbg_index_bed5a9f21dfebeea: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = getObject(arg0).index(getStringFromWasm0(arg1, arg2));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_indexedDB_9e20c97c033151f3: function() { return handleError(function (arg0) {
            const ret = getObject(arg0).indexedDB;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        }, arguments); },
        __wbg_indexedDB_ced363f3de8fb099: function() { return handleError(function (arg0) {
            const ret = getObject(arg0).indexedDB;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        }, arguments); },
        __wbg_instanceof_ArrayBuffer_993d02d2d254cad1: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof ArrayBuffer;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_DomException_55a5af63fefe4042: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof DOMException;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_IdbCursorWithValue_7432b6cb42097c6a: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof IDBCursorWithValue;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_IdbCursor_9bd028886fa2ccf0: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof IDBCursor;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_IdbDatabase_e9dd9f20c51d8d42: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof IDBDatabase;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_IdbOpenDbRequest_b913751ffb9239bb: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof IDBOpenDBRequest;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_IdbRequest_471b050024626dac: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof IDBRequest;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Map_9a4d6ead180ae3a9: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof Map;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Response_8f49efbd4bfd76d6: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof Response;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_TypeError_7942c29ccd071239: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof TypeError;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Uint8Array_f935dbb0aa7cdeed: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof Uint8Array;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Window_5625ff9937037a38: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof Window;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_WorkerGlobalScope_8c58a6d74926b578: function(arg0) {
            let result;
            try {
                result = getObject(arg0) instanceof WorkerGlobalScope;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_isArray_6339f732981044bf: function(arg0) {
            const ret = Array.isArray(getObject(arg0));
            return ret;
        },
        __wbg_isSafeInteger_f3d6cd19ccfe4512: function(arg0) {
            const ret = Number.isSafeInteger(getObject(arg0));
            return ret;
        },
        __wbg_iterator_5cebbb86e33c6dd6: function() {
            const ret = Symbol.iterator;
            return addHeapObject(ret);
        },
        __wbg_length_36bd29c6848c2144: function(arg0) {
            const ret = getObject(arg0).length;
            return ret;
        },
        __wbg_length_5038e4965f457d02: function(arg0) {
            const ret = getObject(arg0).length;
            return ret;
        },
        __wbg_length_ecfa2c63d3d0d82c: function(arg0) {
            const ret = getObject(arg0).length;
            return ret;
        },
        __wbg_lowerBound_66a1695f45ef6c88: function() { return handleError(function (arg0, arg1) {
            const ret = IDBKeyRange.lowerBound(getObject(arg0), arg1 !== 0);
            return addHeapObject(ret);
        }, arguments); },
        __wbg_msCrypto_bd5a034af96bcba6: function(arg0) {
            const ret = getObject(arg0).msCrypto;
            return addHeapObject(ret);
        },
        __wbg_name_facbed56940f0fec: function(arg0, arg1) {
            const ret = getObject(arg1).name;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_new_0_f117d868b403dc07: function() {
            const ret = new Date();
            return addHeapObject(ret);
        },
        __wbg_new_116be93542d39019: function() {
            const ret = new Array();
            return addHeapObject(ret);
        },
        __wbg_new_358857d90afd5a2d: function(arg0, arg1) {
            const ret = new Error(getStringFromWasm0(arg0, arg1));
            return addHeapObject(ret);
        },
        __wbg_new_77cc4f4f472aeb81: function(arg0) {
            const ret = new Uint8Array(getObject(arg0));
            return addHeapObject(ret);
        },
        __wbg_new_95039e162b0c4466: function() { return handleError(function () {
            const ret = new Headers();
            return addHeapObject(ret);
        }, arguments); },
        __wbg_new_ebe3e0f6837f0879: function() {
            const ret = new Object();
            return addHeapObject(ret);
        },
        __wbg_new_f5712de39c931ddf: function() { return handleError(function () {
            const ret = new AbortController();
            return addHeapObject(ret);
        }, arguments); },
        __wbg_new_f9d6489212f3b2b3: function(arg0) {
            const ret = new Date(getObject(arg0));
            return addHeapObject(ret);
        },
        __wbg_new_from_slice_3eea173078478cfe: function(arg0, arg1) {
            const ret = new Uint8Array(getArrayU8FromWasm0(arg0, arg1));
            return addHeapObject(ret);
        },
        __wbg_new_typed_cceaf62d8d95e9f2: function(arg0, arg1) {
            try {
                var state0 = {a: arg0, b: arg1};
                var cb0 = (arg0, arg1) => {
                    const a = state0.a;
                    state0.a = 0;
                    try {
                        return __wasm_bindgen_func_elem_754(a, state0.b, arg0, arg1);
                    } finally {
                        state0.a = a;
                    }
                };
                const ret = new Promise(cb0);
                return addHeapObject(ret);
            } finally {
                state0.a = 0;
            }
        },
        __wbg_new_with_byte_offset_and_length_ff6e927f8d72f0c3: function(arg0, arg1, arg2) {
            const ret = new Uint8Array(getObject(arg0), arg1 >>> 0, arg2 >>> 0);
            return addHeapObject(ret);
        },
        __wbg_new_with_length_2ccc5dbfb4541247: function(arg0) {
            const ret = new Array(arg0 >>> 0);
            return addHeapObject(ret);
        },
        __wbg_new_with_length_3ffc1c56427c525c: function(arg0) {
            const ret = new Uint8Array(arg0 >>> 0);
            return addHeapObject(ret);
        },
        __wbg_new_with_str_and_init_5a37d576dec75a86: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = new Request(getStringFromWasm0(arg0, arg1), getObject(arg2));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_next_42cf16ee0dafc9e2: function() { return handleError(function (arg0) {
            const ret = getObject(arg0).next();
            return addHeapObject(ret);
        }, arguments); },
        __wbg_next_8f26b64fa5e9f64b: function(arg0) {
            const ret = getObject(arg0).next;
            return addHeapObject(ret);
        },
        __wbg_node_84ea875411254db1: function(arg0) {
            const ret = getObject(arg0).node;
            return addHeapObject(ret);
        },
        __wbg_now_8b265300afd5f2b9: function() {
            const ret = Date.now();
            return ret;
        },
        __wbg_now_e7c6795a7f81e10f: function(arg0) {
            const ret = getObject(arg0).now();
            return ret;
        },
        __wbg_objectStoreNames_94ee5410bc505cae: function(arg0) {
            const ret = getObject(arg0).objectStoreNames;
            return addHeapObject(ret);
        },
        __wbg_objectStore_222b7add2b5c2770: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = getObject(arg0).objectStore(getStringFromWasm0(arg1, arg2));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_onchainwallet_new: function(arg0) {
            const ret = OnchainWallet.__wrap(arg0);
            return addHeapObject(ret);
        },
        __wbg_openCursor_3fe49f5b6ffd0a87: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = getObject(arg0).openCursor(getObject(arg1), __wbindgen_enum_IdbCursorDirection[arg2]);
            return addHeapObject(ret);
        }, arguments); },
        __wbg_openCursor_a3ec8c3d59fa44d6: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = getObject(arg0).openCursor(getObject(arg1), __wbindgen_enum_IdbCursorDirection[arg2]);
            return addHeapObject(ret);
        }, arguments); },
        __wbg_open_66c8b00ee562451f: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = getObject(arg0).open(getStringFromWasm0(arg1, arg2));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_open_c5ecda93515ce190: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            const ret = getObject(arg0).open(getStringFromWasm0(arg1, arg2), arg3 >>> 0);
            return addHeapObject(ret);
        }, arguments); },
        __wbg_performance_3fcf6e32a7e1ed0a: function(arg0) {
            const ret = getObject(arg0).performance;
            return addHeapObject(ret);
        },
        __wbg_preventDefault_19878c58b8010668: function(arg0) {
            getObject(arg0).preventDefault();
        },
        __wbg_process_44c7a14e11e9f69e: function(arg0) {
            const ret = getObject(arg0).process;
            return addHeapObject(ret);
        },
        __wbg_prototypesetcall_de8e0d9553586985: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), getObject(arg2));
        },
        __wbg_put_5e0ae8c80bb952a7: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = getObject(arg0).put(getObject(arg1), getObject(arg2));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_queueMicrotask_ac694eae12e92dfb: function(arg0) {
            queueMicrotask(getObject(arg0));
        },
        __wbg_queueMicrotask_be5fe34a8f4cad4d: function(arg0) {
            const ret = getObject(arg0).queueMicrotask;
            return addHeapObject(ret);
        },
        __wbg_randomFillSync_6c25eac9869eb53c: function() { return handleError(function (arg0, arg1) {
            getObject(arg0).randomFillSync(takeObject(arg1));
        }, arguments); },
        __wbg_read_ae34ffedeb11f034: function(arg0) {
            const ret = getObject(arg0).read();
            return addHeapObject(ret);
        },
        __wbg_releaseLock_f38d2d1c08212a8a: function(arg0) {
            getObject(arg0).releaseLock();
        },
        __wbg_require_b4edbdcf3e2a1ef0: function() { return handleError(function () {
            const ret = module.require;
            return addHeapObject(ret);
        }, arguments); },
        __wbg_resolve_020f95d838c6ef25: function(arg0) {
            const ret = Promise.resolve(getObject(arg0));
            return addHeapObject(ret);
        },
        __wbg_respond_f88cbcebace42068: function() { return handleError(function (arg0, arg1) {
            getObject(arg0).respond(arg1 >>> 0);
        }, arguments); },
        __wbg_result_0501bea148306f01: function() { return handleError(function (arg0) {
            const ret = getObject(arg0).result;
            return addHeapObject(ret);
        }, arguments); },
        __wbg_setTimeout_9f4169770fc5a5c3: function(arg0, arg1) {
            const ret = setTimeout(getObject(arg0), arg1);
            return addHeapObject(ret);
        },
        __wbg_setTimeout_ef24d2fc3ad97385: function() { return handleError(function (arg0, arg1) {
            const ret = setTimeout(getObject(arg0), arg1);
            return addHeapObject(ret);
        }, arguments); },
        __wbg_setTimeout_f757f00851f76c42: function(arg0, arg1) {
            const ret = setTimeout(getObject(arg0), arg1);
            return addHeapObject(ret);
        },
        __wbg_set_6be42768c690e380: function(arg0, arg1, arg2) {
            getObject(arg0)[takeObject(arg1)] = takeObject(arg2);
        },
        __wbg_set_8155bb79a948541b: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = Reflect.set(getObject(arg0), getObject(arg1), getObject(arg2));
            return ret;
        }, arguments); },
        __wbg_set_a80955eb93b145c6: function(arg0, arg1, arg2) {
            getObject(arg0)[arg1 >>> 0] = takeObject(arg2);
        },
        __wbg_set_b9b5b5cb7b495037: function(arg0, arg1, arg2) {
            getObject(arg0).set(getArrayU8FromWasm0(arg1, arg2));
        },
        __wbg_set_body_f301b68bff45f419: function(arg0, arg1) {
            getObject(arg0).body = getObject(arg1);
        },
        __wbg_set_cache_ab8f11813716fe29: function(arg0, arg1) {
            getObject(arg0).cache = __wbindgen_enum_RequestCache[arg1];
        },
        __wbg_set_credentials_d7f3b810cbf191e1: function(arg0, arg1) {
            getObject(arg0).credentials = __wbindgen_enum_RequestCredentials[arg1];
        },
        __wbg_set_e92392c4b44c5de1: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
            getObject(arg0).set(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4));
        }, arguments); },
        __wbg_set_headers_805555608daf7f2a: function(arg0, arg1) {
            getObject(arg0).headers = getObject(arg1);
        },
        __wbg_set_integrity_c05dca79461dfe0a: function(arg0, arg1, arg2) {
            getObject(arg0).integrity = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_method_cf2b992b9a610bc3: function(arg0, arg1, arg2) {
            getObject(arg0).method = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_mode_d6479dfd6696c8d3: function(arg0, arg1) {
            getObject(arg0).mode = __wbindgen_enum_RequestMode[arg1];
        },
        __wbg_set_onerror_41278ace6abe3973: function(arg0, arg1) {
            getObject(arg0).onerror = getObject(arg1);
        },
        __wbg_set_onsuccess_86d76d6974cd57e4: function(arg0, arg1) {
            getObject(arg0).onsuccess = getObject(arg1);
        },
        __wbg_set_onupgradeneeded_79b60102909f4a5e: function(arg0, arg1) {
            getObject(arg0).onupgradeneeded = getObject(arg1);
        },
        __wbg_set_redirect_9d53fb52143d8ea4: function(arg0, arg1) {
            getObject(arg0).redirect = __wbindgen_enum_RequestRedirect[arg1];
        },
        __wbg_set_referrer_de24582cadb58b95: function(arg0, arg1, arg2) {
            getObject(arg0).referrer = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_referrer_policy_3f990097931e92b7: function(arg0, arg1) {
            getObject(arg0).referrerPolicy = __wbindgen_enum_ReferrerPolicy[arg1];
        },
        __wbg_set_signal_115b9e9423652e66: function(arg0, arg1) {
            getObject(arg0).signal = getObject(arg1);
        },
        __wbg_signal_58449b7eb331d1be: function(arg0) {
            const ret = getObject(arg0).signal;
            return addHeapObject(ret);
        },
        __wbg_static_accessor_GLOBAL_THIS_466428f93b4eaa76: function() {
            const ret = typeof globalThis === 'undefined' ? null : globalThis;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        },
        __wbg_static_accessor_GLOBAL_c7aea38d4de089bc: function() {
            const ret = typeof global === 'undefined' ? null : global;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        },
        __wbg_static_accessor_SELF_42d4fae05e59267a: function() {
            const ret = typeof self === 'undefined' ? null : self;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        },
        __wbg_static_accessor_WINDOW_e0db14a0eba6a812: function() {
            const ret = typeof window === 'undefined' ? null : window;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        },
        __wbg_status_b0de02a07fd7d927: function(arg0) {
            const ret = getObject(arg0).status;
            return ret;
        },
        __wbg_stringify_f93a4ebae9231922: function() { return handleError(function (arg0) {
            const ret = JSON.stringify(getObject(arg0));
            return addHeapObject(ret);
        }, arguments); },
        __wbg_subarray_a4cc58201c7359fd: function(arg0, arg1, arg2) {
            const ret = getObject(arg0).subarray(arg1 >>> 0, arg2 >>> 0);
            return addHeapObject(ret);
        },
        __wbg_target_13424fe1cdc436ac: function(arg0) {
            const ret = getObject(arg0).target;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        },
        __wbg_text_9302f33ea8cfce7b: function() { return handleError(function (arg0) {
            const ret = getObject(arg0).text();
            return addHeapObject(ret);
        }, arguments); },
        __wbg_then_7026b513a94278a8: function(arg0, arg1) {
            const ret = getObject(arg0).then(getObject(arg1));
            return addHeapObject(ret);
        },
        __wbg_then_72819b8d4e081fb5: function(arg0, arg1, arg2) {
            const ret = getObject(arg0).then(getObject(arg1), getObject(arg2));
            return addHeapObject(ret);
        },
        __wbg_toString_2f0b0aec069cb718: function(arg0) {
            const ret = getObject(arg0).toString();
            return addHeapObject(ret);
        },
        __wbg_transaction_4c999693e6e601bf: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = getObject(arg0).transaction(getObject(arg1), __wbindgen_enum_IdbTransactionMode[arg2]);
            return addHeapObject(ret);
        }, arguments); },
        __wbg_transaction_77d93778cbec28c3: function(arg0) {
            const ret = getObject(arg0).transaction;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        },
        __wbg_upperBound_916ed065b0d6fe6c: function() { return handleError(function (arg0, arg1) {
            const ret = IDBKeyRange.upperBound(getObject(arg0), arg1 !== 0);
            return addHeapObject(ret);
        }, arguments); },
        __wbg_url_82c95d5d2e2ba977: function(arg0, arg1) {
            const ret = getObject(arg1).url;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_value_1e2369fab29b420e: function(arg0) {
            const ret = getObject(arg0).value;
            return addHeapObject(ret);
        },
        __wbg_value_496e02446340ae74: function() { return handleError(function (arg0) {
            const ret = getObject(arg0).value;
            return addHeapObject(ret);
        }, arguments); },
        __wbg_version_26237923fff15d6e: function(arg0) {
            const ret = getObject(arg0).version;
            return ret;
        },
        __wbg_versions_276b2795b1c6a219: function(arg0) {
            const ret = getObject(arg0).versions;
            return addHeapObject(ret);
        },
        __wbg_view_7685fe4b2845c5b6: function(arg0) {
            const ret = getObject(arg0).view;
            return isLikeNone(ret) ? 0 : addHeapObject(ret);
        },
        __wbg_wallet_new: function(arg0) {
            const ret = Wallet.__wrap(arg0);
            return addHeapObject(ret);
        },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [Externref], shim_idx: 138, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, __wasm_bindgen_func_elem_2713);
            return addHeapObject(ret);
        },
        __wbindgen_cast_0000000000000002: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [Externref], shim_idx: 1647, ret: Externref, inner_ret: Some(Externref) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, __wasm_bindgen_func_elem_17288);
            return addHeapObject(ret);
        },
        __wbindgen_cast_0000000000000003: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [Externref], shim_idx: 93, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, __wasm_bindgen_func_elem_748);
            return addHeapObject(ret);
        },
        __wbindgen_cast_0000000000000004: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("Event")], shim_idx: 1490, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, __wasm_bindgen_func_elem_14883);
            return addHeapObject(ret);
        },
        __wbindgen_cast_0000000000000005: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("Event")], shim_idx: 1649, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, __wasm_bindgen_func_elem_17286);
            return addHeapObject(ret);
        },
        __wbindgen_cast_0000000000000006: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("IDBVersionChangeEvent")], shim_idx: 1648, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, __wasm_bindgen_func_elem_17289);
            return addHeapObject(ret);
        },
        __wbindgen_cast_0000000000000007: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [], shim_idx: 1422, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, __wasm_bindgen_func_elem_14549);
            return addHeapObject(ret);
        },
        __wbindgen_cast_0000000000000008: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [], shim_idx: 1542, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, __wasm_bindgen_func_elem_15211);
            return addHeapObject(ret);
        },
        __wbindgen_cast_0000000000000009: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [], shim_idx: 1547, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, __wasm_bindgen_func_elem_15262);
            return addHeapObject(ret);
        },
        __wbindgen_cast_000000000000000a: function(arg0) {
            // Cast intrinsic for `F64 -> Externref`.
            const ret = arg0;
            return addHeapObject(ret);
        },
        __wbindgen_cast_000000000000000b: function(arg0) {
            // Cast intrinsic for `I64 -> Externref`.
            const ret = arg0;
            return addHeapObject(ret);
        },
        __wbindgen_cast_000000000000000c: function(arg0, arg1) {
            // Cast intrinsic for `Ref(Slice(U8)) -> NamedExternref("Uint8Array")`.
            const ret = getArrayU8FromWasm0(arg0, arg1);
            return addHeapObject(ret);
        },
        __wbindgen_cast_000000000000000d: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return addHeapObject(ret);
        },
        __wbindgen_cast_000000000000000e: function(arg0) {
            // Cast intrinsic for `U64 -> Externref`.
            const ret = BigInt.asUintN(64, arg0);
            return addHeapObject(ret);
        },
        __wbindgen_cast_000000000000000f: function(arg0, arg1) {
            var v0 = getArrayJsValueFromWasm0(arg0, arg1);
            wasm.__wbindgen_export5(arg0, arg1 * 4, 4);
            // Cast intrinsic for `Vector(NamedExternref("ExitProgressStatus")) -> Externref`.
            const ret = v0;
            return addHeapObject(ret);
        },
        __wbindgen_cast_0000000000000010: function(arg0, arg1) {
            var v0 = getArrayJsValueFromWasm0(arg0, arg1);
            wasm.__wbindgen_export5(arg0, arg1 * 4, 4);
            // Cast intrinsic for `Vector(NamedExternref("ExitVtxo")) -> Externref`.
            const ret = v0;
            return addHeapObject(ret);
        },
        __wbindgen_cast_0000000000000011: function(arg0, arg1) {
            var v0 = getArrayJsValueFromWasm0(arg0, arg1);
            wasm.__wbindgen_export5(arg0, arg1 * 4, 4);
            // Cast intrinsic for `Vector(NamedExternref("LightningReceive")) -> Externref`.
            const ret = v0;
            return addHeapObject(ret);
        },
        __wbindgen_cast_0000000000000012: function(arg0, arg1) {
            var v0 = getArrayJsValueFromWasm0(arg0, arg1);
            wasm.__wbindgen_export5(arg0, arg1 * 4, 4);
            // Cast intrinsic for `Vector(NamedExternref("LightningSend")) -> Externref`.
            const ret = v0;
            return addHeapObject(ret);
        },
        __wbindgen_cast_0000000000000013: function(arg0, arg1) {
            var v0 = getArrayJsValueFromWasm0(arg0, arg1);
            wasm.__wbindgen_export5(arg0, arg1 * 4, 4);
            // Cast intrinsic for `Vector(NamedExternref("Movement")) -> Externref`.
            const ret = v0;
            return addHeapObject(ret);
        },
        __wbindgen_cast_0000000000000014: function(arg0, arg1) {
            var v0 = getArrayJsValueFromWasm0(arg0, arg1);
            wasm.__wbindgen_export5(arg0, arg1 * 4, 4);
            // Cast intrinsic for `Vector(NamedExternref("OnchainUtxo")) -> Externref`.
            const ret = v0;
            return addHeapObject(ret);
        },
        __wbindgen_cast_0000000000000015: function(arg0, arg1) {
            var v0 = getArrayJsValueFromWasm0(arg0, arg1);
            wasm.__wbindgen_export5(arg0, arg1 * 4, 4);
            // Cast intrinsic for `Vector(NamedExternref("PendingBoard")) -> Externref`.
            const ret = v0;
            return addHeapObject(ret);
        },
        __wbindgen_cast_0000000000000016: function(arg0, arg1) {
            var v0 = getArrayJsValueFromWasm0(arg0, arg1);
            wasm.__wbindgen_export5(arg0, arg1 * 4, 4);
            // Cast intrinsic for `Vector(NamedExternref("RoundState")) -> Externref`.
            const ret = v0;
            return addHeapObject(ret);
        },
        __wbindgen_cast_0000000000000017: function(arg0, arg1) {
            var v0 = getArrayJsValueFromWasm0(arg0, arg1);
            wasm.__wbindgen_export5(arg0, arg1 * 4, 4);
            // Cast intrinsic for `Vector(NamedExternref("Vtxo")) -> Externref`.
            const ret = v0;
            return addHeapObject(ret);
        },
        __wbindgen_cast_0000000000000018: function(arg0, arg1) {
            var v0 = getArrayJsValueFromWasm0(arg0, arg1);
            wasm.__wbindgen_export5(arg0, arg1 * 4, 4);
            // Cast intrinsic for `Vector(NamedExternref("WalletTransaction")) -> Externref`.
            const ret = v0;
            return addHeapObject(ret);
        },
        __wbindgen_cast_0000000000000019: function(arg0, arg1) {
            var v0 = getArrayJsValueFromWasm0(arg0, arg1);
            wasm.__wbindgen_export5(arg0, arg1 * 4, 4);
            // Cast intrinsic for `Vector(NamedExternref("string")) -> Externref`.
            const ret = v0;
            return addHeapObject(ret);
        },
        __wbindgen_object_clone_ref: function(arg0) {
            const ret = getObject(arg0);
            return addHeapObject(ret);
        },
        __wbindgen_object_drop_ref: function(arg0) {
            takeObject(arg0);
        },
    };
    return {
        __proto__: null,
        "./bark_ffi_wasm_bg.js": import0,
    };
}

function __wasm_bindgen_func_elem_14549(arg0, arg1) {
    wasm.__wasm_bindgen_func_elem_14549(arg0, arg1);
}

function __wasm_bindgen_func_elem_15211(arg0, arg1) {
    wasm.__wasm_bindgen_func_elem_15211(arg0, arg1);
}

function __wasm_bindgen_func_elem_15262(arg0, arg1) {
    wasm.__wasm_bindgen_func_elem_15262(arg0, arg1);
}

function __wasm_bindgen_func_elem_2713(arg0, arg1, arg2) {
    wasm.__wasm_bindgen_func_elem_2713(arg0, arg1, addHeapObject(arg2));
}

function __wasm_bindgen_func_elem_14883(arg0, arg1, arg2) {
    wasm.__wasm_bindgen_func_elem_14883(arg0, arg1, addHeapObject(arg2));
}

function __wasm_bindgen_func_elem_17289(arg0, arg1, arg2) {
    wasm.__wasm_bindgen_func_elem_17289(arg0, arg1, addHeapObject(arg2));
}

function __wasm_bindgen_func_elem_17288(arg0, arg1, arg2) {
    const ret = wasm.__wasm_bindgen_func_elem_17288(arg0, arg1, addHeapObject(arg2));
    return takeObject(ret);
}

function __wasm_bindgen_func_elem_748(arg0, arg1, arg2) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.__wasm_bindgen_func_elem_748(retptr, arg0, arg1, addHeapObject(arg2));
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        if (r1) {
            throw takeObject(r0);
        }
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

function __wasm_bindgen_func_elem_17286(arg0, arg1, arg2) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.__wasm_bindgen_func_elem_17286(retptr, arg0, arg1, addHeapObject(arg2));
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        if (r1) {
            throw takeObject(r0);
        }
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

function __wasm_bindgen_func_elem_754(arg0, arg1, arg2, arg3) {
    wasm.__wasm_bindgen_func_elem_754(arg0, arg1, addHeapObject(arg2), addHeapObject(arg3));
}


const __wbindgen_enum_IdbCursorDirection = ["next", "nextunique", "prev", "prevunique"];


const __wbindgen_enum_IdbTransactionMode = ["readonly", "readwrite", "versionchange", "readwriteflush", "cleanup"];


const __wbindgen_enum_ReadableStreamType = ["bytes"];


const __wbindgen_enum_ReferrerPolicy = ["", "no-referrer", "no-referrer-when-downgrade", "origin", "origin-when-cross-origin", "unsafe-url", "same-origin", "strict-origin", "strict-origin-when-cross-origin"];


const __wbindgen_enum_RequestCache = ["default", "no-store", "reload", "no-cache", "force-cache", "only-if-cached"];


const __wbindgen_enum_RequestCredentials = ["omit", "same-origin", "include"];


const __wbindgen_enum_RequestMode = ["same-origin", "no-cors", "cors", "navigate"];


const __wbindgen_enum_RequestRedirect = ["follow", "error", "manual"];
const IntoUnderlyingByteSourceFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_intounderlyingbytesource_free(ptr, 1));
const IntoUnderlyingSinkFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_intounderlyingsink_free(ptr, 1));
const IntoUnderlyingSourceFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_intounderlyingsource_free(ptr, 1));
const NotificationHolderFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_notificationholder_free(ptr, 1));
const OnchainWalletFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_onchainwallet_free(ptr, 1));
const WalletFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wallet_free(ptr, 1));

function addHeapObject(obj) {
    if (heap_next === heap.length) heap.push(heap.length + 1);
    const idx = heap_next;
    heap_next = heap[idx];

    heap[idx] = obj;
    return idx;
}

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
}

const CLOSURE_DTORS = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(state => wasm.__wbindgen_export4(state.a, state.b));

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

function dropObject(idx) {
    if (idx < 1028) return;
    heap[idx] = heap_next;
    heap_next = idx;
}

function getArrayJsValueFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    const mem = getDataViewMemory0();
    const result = [];
    for (let i = ptr; i < ptr + 4 * len; i += 4) {
        result.push(takeObject(mem.getUint32(i, true)));
    }
    return result;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function getObject(idx) { return heap[idx]; }

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        wasm.__wbindgen_export3(addHeapObject(e));
    }
}

let heap = new Array(1024).fill(undefined);
heap.push(undefined, null, true, false);

let heap_next = heap.length;

function isLikeNone(x) {
    return x === undefined || x === null;
}

function makeMutClosure(arg0, arg1, f) {
    const state = { a: arg0, b: arg1, cnt: 1 };
    const real = (...args) => {

        // First up with a closure we increment the internal reference
        // count. This ensures that the Rust closure environment won't
        // be deallocated while we're invoking it.
        state.cnt++;
        const a = state.a;
        state.a = 0;
        try {
            return f(a, state.b, ...args);
        } finally {
            state.a = a;
            real._wbg_cb_unref();
        }
    };
    real._wbg_cb_unref = () => {
        if (--state.cnt === 0) {
            wasm.__wbindgen_export4(state.a, state.b);
            state.a = 0;
            CLOSURE_DTORS.unregister(state);
        }
    };
    CLOSURE_DTORS.register(real, state, state);
    return real;
}

function passArrayJsValueToWasm0(array, malloc) {
    const ptr = malloc(array.length * 4, 4) >>> 0;
    const mem = getDataViewMemory0();
    for (let i = 0; i < array.length; i++) {
        mem.setUint32(ptr + 4 * i, addHeapObject(array[i]), true);
    }
    WASM_VECTOR_LEN = array.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeObject(idx) {
    const ret = getObject(idx);
    dropObject(idx);
    return ret;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('bark_ffi_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
