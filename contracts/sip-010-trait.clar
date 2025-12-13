(define-trait sip-010-trait
  (
    ;; Standard SIP-010 Functions
    (transfer (uint principal principal (optional (buff 34))) (response bool uint))
    (get-name () (response (string-ascii 32) uint))
    (get-symbol () (response (string-ascii 32) uint))
    (get-decimals () (response uint uint))
    (get-balance (principal) (response uint uint))
    (get-total-supply () (response uint uint))
    (get-token-uri () (response (optional (string-utf8 256)) uint))

    ;; ADDED: We need these so the Bonding Curve is allowed to call them!
    (mint (uint principal) (response bool uint))
    (burn (uint principal) (response bool uint))
  )
)