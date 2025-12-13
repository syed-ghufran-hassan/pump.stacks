;; @title Bonding Curve Token (SIP-010 Standard)
;; @desc A standard fungible token that can ONLY be minted by the bonding curve

;; ---------------------------------------------------------
;; SIP-010 Trait Definition
;; ---------------------------------------------------------
(impl-trait .sip-010-trait.sip-010-trait)

;; ---------------------------------------------------------
;; Constants & Variables
;; ---------------------------------------------------------
(define-fungible-token meme-token)

;; Replace this with the deployed address of your bonding curve contract!
;; For now, we set it to tx-sender (deployer), but it must be updated to the bonding curve contract.
(define-data-var bonding-curve-admin principal tx-sender)

(define-constant ERR-NOT-AUTHORIZED (err u1001))

;; ---------------------------------------------------------
;; Administration
;; ---------------------------------------------------------

;; Set the bonding curve contract as the only authorized minter
(define-public (set-bonding-curve-address (new-admin principal))
    (begin
        ;; Only the current admin (deployer) can set this initially
        (asserts! (is-eq tx-sender (var-get bonding-curve-admin)) ERR-NOT-AUTHORIZED)
        (ok (var-set bonding-curve-admin new-admin))
    )
)

;; ---------------------------------------------------------
;; SIP-010 Standard Functions
;; ---------------------------------------------------------

(define-read-only (get-name)
    (ok "Pump Stacks Token")
)

(define-read-only (get-symbol)
    (ok "PUMP")
)

(define-read-only (get-decimals)
    (ok u6) ;; Same decimals as STX
)

(define-read-only (get-balance (user principal))
    (ok (ft-get-balance meme-token user))
)

(define-read-only (get-total-supply)
    (ok (ft-get-supply meme-token))
)

(define-read-only (get-token-uri)
    (ok (some u"https://ipfs.io/ipfs/QmYourMetadataHashHere"))
)

(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
    (begin
        (asserts! (is-eq tx-sender sender) ERR-NOT-AUTHORIZED)
        (try! (ft-transfer? meme-token amount sender recipient))
        (match memo to-print (print to-print) 0x)
        (ok true)
    )
)

;; ---------------------------------------------------------
;; Core Pump Functionality (Mint/Burn)
;; ---------------------------------------------------------

;; MINT: Only the Bonding Curve contract can call this!
(define-public (mint (amount uint) (recipient principal))
    (begin
        (asserts! (is-eq tx-sender (var-get bonding-curve-admin)) ERR-NOT-AUTHORIZED)
        (ft-mint? meme-token amount recipient)
    )
)

;; BURN: Only the Bonding Curve contract can call this (when users sell)!
(define-public (burn (amount uint) (sender principal))
    (begin
        (asserts! (is-eq tx-sender (var-get bonding-curve-admin)) ERR-NOT-AUTHORIZED)
        (ft-burn? meme-token amount sender)
    )
)
