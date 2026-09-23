# GOAL.md

## Status
ACTIVE

## Active Objective

**Goal 16: Ein Mensch stellt einen Auftrag ein, ohne Wallet, ohne Signatur, ohne USDC.**

Nennt ausdruecklich den gesperrten Pfad **`src/auth/**`**, weil dort der Engpass liegt und
`loop-constraints.md` genau diese Form vorsieht ("nur innerhalb eines Goals, dessen GOAL.md sie
nennt"). `src/payments/**` bleibt unberuehrt: hier wird nichts bezahlt.

### Warum das und nicht etwas anderes

43 von 43 Besuchern sind an derselben Stelle stehengeblieben, und die Seite sagt ihnen den Grund
selbst ins Gesicht. Auf `/check` steht heute woertlich: *"They do need a wallet, in the sense of a
key pair on your own machine that signs one message."* Das ist die Wand, und sie steht in der
Einladung.

`createApiKey` verlangt eine Session, und eine Session schreibt ausschliesslich `verifySiwe`. Wer
keine Ethereum-Adresse hat, hat also keinen Weg zu einem Schluessel, und ohne Schluessel kann er
nichts tun ausser lesen. SIWE steht dort nicht aus einem Sicherheitsgrund, sondern weil Conways
Runtime es so macht: `provision.ts` verdrahtet Domain und chainId fest. Fuer einen Menschen im
Browser beweist die Signatur nichts, was dieser Dienst braucht, denn er fuehrt keine Guthaben, die
jemandem sonst gehoeren, und er zahlt nichts aus.

Das ist zugleich der erste Schritt von **T3.3** und die Bedingung fuer **Punkt 4** (Stripe): ein
Kaeufer mit Karte hat keine Wallet, und ein Zahlungsweg ohne Identitaetsweg oeffnet nichts.

### Die Form

Der Schluessel **ist** das Konto. Kein Passwort, keine Mail, keine Wiederherstellung, und die
Seite sagt das in dem Satz, in dem sie den Schluessel zeigt. Das ist keine Sparversion von
Anmeldung, sondern dieselbe Bauform, die der Dienst fuer Agenten schon hat: `resolveApiKey` loest
einen Schluessel zu einer Adresse auf, mehr Identitaet gab es hier nie.

Die Kennung ist **keine Ethereum-Adresse** und sieht auch nicht so aus (`key:` plus 40 Hex). Wo
der Code eine Adresse wirklich braucht, prueft er sie mit `isAddress` (`src/payments/pay.ts`,
`src/registry.ts`), und diese Kennung faellt dort durch, statt still etwas Falsches zu tun. Auf
dem Weg des Kaeufers liegt keine dieser Stellen: `bounties.creator` ist eine undurchsichtige
Zeichenkette, `wallets.address` ebenso.

### Done, gemessen und nicht behauptet

1. Ein Fremder kommt von `/check` bis zu einem offenen Auftrag auf `/jobs`, in einem Browser,
   ohne Schluesselpaar, ohne Signatur, ohne USDC. Nachgewiesen mit `ops/stranger-client.sh` oder
   einem neuen Skript, das denselben Weg ohne Wallet abgeht, gegen Produktion.
2. Er kommt mit dem Schluessel zurueck und vergibt. Ohne diesen Teil laeuft jeder Auftrag ab und
   der Zuschuss geht an den Topf zurueck, der Weg schliesst sich also nie.
3. Das Praegen von Schluesseln kann den Topf nicht leerlaufen lassen. Heute haengt die Schranke an
   "ein Zuschuss je Adresse", und wenn jeder sich beliebig viele Adressen praegen kann, ist das
   keine Schranke mehr. Gegenprobe: ein Skript, das zehnmal praegt, bekommt hoechstens einen
   Zuschuss.
4. Kein Weg zu einem Schluessel fuer eine **fremde** Ethereum-Adresse. Praegen erzeugt eine neue
   Kennung, es uebernimmt nie eine bestehende.

### Blockers
Keine. Nichts hieran wartet auf Matthias.

(Historie: Goal 10 bis 15 stehen in `goals/2026-09-20-goal-10-15-positionierung.md`.)
