;; @title Linear Bonding Curve Math
;; @desc Calculates price using fixed-point arithmetic
;; @version 1.1 (FIXED)

;; ---------------------------------------------------------
;; Traits & Variables
;; ---------------------------------------------------------
(use-trait sip-010-token .sip-010-trait.sip-010-trait)

(define-constant ERR-MATH-OVERFLOW (err u1001))
(define-constant PRECISION u1000000) ;; 6 decimal places (same as STX)
(define-constant SLOPE u2000) ;; Steepness of the price increase
(define-constant TARGET-SUPPLY u1000000000000) ;; Example: 1 Million tokens
(define-constant ERR-TARGET-NOT-MET (err u2001))
(define-constant ERR-CURVE-CLOSED (err u2002))

(define-data-var current-token-supply uint u0)
(define-data-var curve-active bool true)

;; Define a trait for the DEX so we can call 'add-liquidity'
(define-trait dex-trait
    (
        (add-liquidity (uint uint) (response bool uint))
    )
)

;; ---------------------------------------------------------
;; Read-Only Functions (The Math)
;; ---------------------------------------------------------

;; FIXED: Returns a simple 'uint', NOT a response (removed 'ok')
(define-read-only (get-buy-price (current-supply uint) (tokens-to-buy uint))
    (let
        (
            (doubled-supply (* current-supply u2))
            (sum-supply (+ doubled-supply tokens-to-buy))
            (numerator (* tokens-to-buy sum-supply))
        )
        ;; Return raw number
        (/ (* (/ numerator u2) SLOPE) PRECISION)
    )
)

;; FIXED: Returns a simple 'uint', NOT a response (removed 'ok')
(define-read-only (get-sell-price (current-supply uint) (tokens-to-sell uint))
    (let
        (
            (new-supply (- current-supply tokens-to-sell))
            (doubled-supply (* new-supply u2))
            (sum-supply (+ doubled-supply tokens-to-sell))
            (numerator (* tokens-to-sell sum-supply))
        )
        ;; Return raw number
        (/ (* (/ numerator u2) SLOPE) PRECISION)
    )
)

;; ---------------------------------------------------------
;; The BUY Function
;; ---------------------------------------------------------
(define-public (buy (token-contract <sip-010-token>) (amount-to-buy uint))
    (let
        (
            (current-supply (var-get current-token-supply))
            
            ;; FIXED: Removed 'try!' because get-buy-price is now a simple number
            (price-result (get-buy-price current-supply amount-to-buy))
        )
        (asserts! (is-eq (var-get curve-active) true) ERR-CURVE-CLOSED)
        
        ;; Transfer STX from User -> This Contract
        (try! (stx-transfer? price-result tx-sender (as-contract tx-sender)))

        ;; Mint the Tokens to the User
        (try! (contract-call? token-contract mint amount-to-buy tx-sender))

        ;; Update the Curve Supply
        (var-set current-token-supply (+ current-supply amount-to-buy))

        (ok true)
    )
)

;; ---------------------------------------------------------
;; THE SELL Function
;; ---------------------------------------------------------
(define-public (sell (token-contract <sip-010-token>) (amount-to-sell uint))
    (let
        (
            (current-supply (var-get current-token-supply))
            (sender tx-sender)
            
            ;; FIXED: Removed 'try!' because get-sell-price is now a simple number
            (price-result (get-sell-price current-supply amount-to-sell))
        )

        (asserts! (is-eq (var-get curve-active) true) ERR-CURVE-CLOSED)

        ;; Burn the User's Tokens
        (try! (contract-call? token-contract burn amount-to-sell sender))

        ;; Send STX from Contract -> User
        (try! (as-contract (stx-transfer? price-result tx-sender sender)))

        ;; Update Supply
        (var-set current-token-supply (- current-supply amount-to-sell))

        (ok price-result)
    )
)

;; ---------------------------------------------------------
;; MIGRATION LOGIC
;; ---------------------------------------------------------

(define-public (graduate (token-contract <sip-010-token>) (dex-contract <dex-trait>))
    (let
        (
            (current-supply (var-get current-token-supply))
            (contract-stx-balance (stx-get-balance (as-contract tx-sender)))
        )
        
        (asserts! (>= current-supply TARGET-SUPPLY) ERR-TARGET-NOT-MET)
        (asserts! (is-eq (var-get curve-active) true) ERR-CURVE-CLOSED)

        (var-set curve-active false)

        (let 
            (
                (remaining-tokens (- u1000000000000 current-supply))
            )
            (try! (contract-call? token-contract mint remaining-tokens (as-contract tx-sender)))
        )

        (as-contract 
            (contract-call? dex-contract add-liquidity contract-stx-balance u1000000000000)
        )
    )
)