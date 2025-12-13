;; @title Mock DEX for Testnet
(define-public (add-liquidity (stx-amount uint) (token-amount uint))
    (begin
        (print "LIQUIDITY RECEIVED!")
        (print stx-amount)
        (print token-amount)
        ;; In a real DEX, this would transfer assets to a pool. 
        ;; Here, we just return true to prove the bonding curve works.
        (ok true)
    )
)
