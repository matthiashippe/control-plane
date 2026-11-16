# Public Suffix List (PSL) Submission

<!--
Each PSL PR needs to have a description, rationale, indication of DNS validation and syntax checking, as well as a number of acknowledgements from the submitter. This template must be included with each PR, and the submitting party MUST provide responses to all of the elements in order to be considered.
-->

<!-- #### READ THIS FIRST ####

If you haven't yet, please read our guidelines:
https://github.com/publicsuffix/list/wiki/Guidelines#submit-the-change

Also, read them again, as many skip that part and 
get confused about why their PR is delayed or does
not get accepted when their submission doesn't follow them.

A recent PR using the current template is 
https://github.com/publicsuffix/list/pull/2835, although 
the organization and description were not as substantial 
as desired, which required maintainers' time to visit the 
requestor's website to further research.
Having more robust org/desc improves the PR processing 
pace because extra cycles are not lost to research.
For an example of what an excellent description in a PR looks like
see https://github.com/publicsuffix/list/pull/615, 
although that example uses an earlier template.
-->

### Checklist of required steps

* [x] Description of Organization
* [x] Robust Reason for PSL Inclusion
* [x] DNS verification via dig

* [x] Each domain listed in the PRIVATE section has and shall maintain at least two years remaining on registration, and we shall keep the `_psl` TXT record in place in the respective zone(s).

__Submitter affirms the following:__ 
<!--
Third-party Limits are used elsewhere, such as at Cloudflare, Let's 
Encrypt, Apple, GitLab or others, and having an entry in the PSL alters 
the manner in which those third-party systems or products treat 
a given domain name or sub-domains within it.

To be clear, it is appropriate to address how those limits impact 
your domain(s) directly with that third-party, and it is inappropriate 
to submit entries to the PSL as a means to work around those limits or 
restrictions.
-->

 * [x] We are listing *any* third-party limits that we seek to work around in our rationale such as those between iOS 14.5+ and Facebook (see [Issue #1245](https://github.com/publicsuffix/list/issues/1245) as a well-documented example)
 <!-- FILL IN (CAN BE EMPTY): Third-party limits worked around (keep this line and its END FILL IN) -->
 <!-- END FILL IN -->

<!--
The purpose of the question above is to expose limit workarounds.
If there are third party limits that the PR seeks to overcome, those
must be listed within the rationale section of this request, and 
provide a good level of detail regarding the effort that was made to work directly 
with the third party or parties in attempting to address this within their 
rationale response below.
In all cases, software and services should be discouraged from use of
the PSL as a rate-limiting tool, and provide clear instructions to their
own clients, partners and users on the manner in which they can directly
request rate limit increases.
We treat the following as an attestation in the public record of the 
requesting party that they are not attempting to bypass rate limits through
the PR.
-->

 * [x] This request was _not_ submitted with the objective of working around other third-party limits.

<!--
Submitter will maintain domains in good standing or may lose section.

The ongoing trust of the PSL requires it to be free of outdated or problematic entries. In making this pull request, there is a commitment by the submitter that they are going to review and maintain their relevant section. By submitting an entry, the requestor acknowledges that their entry and section may be removed if the domain does not maintain the respective _psl entries in DNS, any domain(s) within their section fail to resolve in DNS, the domain does not get renewed, expires or is otherwise unreachable. The submitter further identifies that it is their responsibility to review their submitted section within the PSL, submitting updates or removals as their domain(s) may change over time. It is also the responsibility of the submitter to provide (and keep up to date) a reachable email address within the section, and to maintain that address as it may change over time, so that they receive notices.
-->

 * [x] The submitter acknowledges that it is their responsibility to maintain the domains within their section. This includes removing names which are no longer used, retaining the _psl DNS entry, and responding to e-mails to the supplied address. Failure to maintain entries may result in removal of individual entries or the entire section.

<!--
The guidelines describe which section to place the entry in, the 
order of commented organization placement, and the order of sorting of entries. 
(Hint: TLD then SLD, ascending sorting) Although it seems pedantic, 
the sorting and formatting rules help ensure all of the automation 
that uses the PSL operates correctly. Typically, both are solved or
neither.
-->

 * [x] The [Guidelines](https://github.com/publicsuffix/list/wiki/Guidelines) were carefully _read_ and _understood_, and this request conforms to them.
 * [x] The submission follows the [Guidelines](https://github.com/publicsuffix/list/wiki/Format) on formatting and sorting.

<!-- 
Sorting and formatting of the entries is outlined in the guidelines 
and non-conforming requests are one of the largest sources of delay,
so getting this right initially will aid successfully having it 
proceed. Mislocated entries and trailing spaces should be avoided.
-->

<!--
In your submission, please include a role-based email address (e.g. security@example.com) rather than a personal email address (e.g. jane.doe@example.com) under your organization name, so that we can maintain contact with your organization, independent of personnel changes.
This email address will be used for any required verification or inquiries regarding your PSL listing. This inbox must be actively maintained and monitored for future communications from the PSL project for as long as the domain remains in the PSL. Any PSL inquiries sent to this address must receive a response within 30 days, as maintaining timely communication is required for continued inclusion in the PSL.
-->

 * [ ] A role-based email address has been used and this inbox is actively monitored with a response time of no more than 30 days.

 Not checked: the address in the entry is the contact address published in our imprint (https://postyourprice.com/impressum), not a role address.

**Abuse Contact:**

<!--
Please confirm that you have accessible abuse contact information on your website. 

At a minimum, you must provide an abuse contact either in the form of an email address or a web form that can be used to report abuse. This contact should be easily accessible to allow concerned parties to notify the registry or subdomain operator directly when malicious activities such as phishing, malware, or abuse are detected. For example, if you provide subdomains at example.com, where users may register subdomains such as clientname.example.com, then in case of abuse, reporters should be able to visit example.com and easily find the relevant abuse contact information.
-->

* [x] Abuse contact information (email or web form) is available and easily accessible.

  URL where abuse contact or abuse reporting form can be found: 
  <!-- Provide the URL where an Internet user can access the abuse contact information -->
  <!-- FILL IN: Abuse contact URL (keep this line and its END FILL IN) -->
  https://postyourprice.com/impressum (redirects to https://postyourprice.com/terms#impressum, which lists the contact email address)
  <!-- END FILL IN -->

---

For PRIVATE section requests that are submitting entries for domains that match their organization website's primary domain, please understand that this can have impacts that may not match the desired outcome and take a long time to roll back, if at all.

To ensure that requested changes are entirely intentional, make sure that you read the affectation and propagation expectations, that you understand them, and confirm this understanding. 

PR Rollbacks have lower priority, and the volunteers are unable to control when or if browsers or other parties using the PSL will refresh or update.

<!-- 
Seriously, carefully read the downline flow of the PSL and the 
guidelines. Your request could very likely alter the cookie and 
certificate (as well as other) behaviours on your core domain name in 
ways that could be problematic for your business.

Rollbacks are really not predictable, as those who use or incorporate 
the PSL do what they do, and when. It is not within the PSL volunteers' 
control to do anything about that. 

The volunteers are busy with new requests, and rollbacks are lowest 
priority, so if something gets broken by your PR, it will potentially 
stay that way for an indefinite period of time (typically long).
-->

(Link: [about propagation/expectations](https://github.com/publicsuffix/list/wiki/Guidelines#appropriate-expectations-on-derivative-propagation-use-or-inclusion))

 * [x] *Yes, I understand*. I could break my organization's website cookies and cause other issues, and the rollback timing is acceptable. *Proceed anyway*.
---

<!--
As you complete each item in the checklist please mark it with an X.

For example:
* [x] Description of Organization
-->

## Description of Organization
<!--
Provide at least 3 sentences (the more the better) but
avoid the promotional stuff about how wonderful it is, and 
please do not copy and paste the mission statement or 
elevator pitch from your org's website.

Also tell us who you (submitter) are and represent (i.e. 
individual, non-profit volunteer, engineer at a business, etc.) 
and what you do (i.e. DynDNS, hosting, etc.), and what your 
role is as submitter with respect to the org and the 
submission.

For the org description, there is less interest in the 
promotional / marketing information about the org and more 
a focus on having concise description of the core focus of 
the submitting org, specifically with context/connection 
to this request.
-->

<!-- FILL IN: Description of Organization (keep this line and its END FILL IN) -->
Hanseatic Tech Company (HTC) is the software business of Matthias Hippe in Hamburg, Germany (imprint: https://postyourprice.com/impressum). HTC operates PostYourPrice, an open-source control plane for the open-source Automaton agent runtime (https://github.com/Conway-Research/automaton) that speaks the same API as the Conway control plane: agents sign in with Sign-In with Ethereum, pay for credits in USDC, and use OpenAI-compatible inference that is billed on the server. The source code is public at https://github.com/matthiashippe/control-plane.

The newest part of the service is sandboxes: an agent rents an isolated Linux sandbox on a dedicated host that is separate from the payment service, runs its own code there, and can expose a port of the sandbox to the internet. sandboxhost.de is the domain under which these exposed ports get their names.

I am submitting this request myself, as the owner and operator of the service and the registrant of sandboxhost.de.
<!-- END FILL IN -->

**Organization Website:**
<!-- Provide the website address of the org as a full URL (i.e. https://example.com) -->
<!-- FILL IN: Organization Website (keep this line and its END FILL IN) -->
https://postyourprice.com
<!-- END FILL IN -->

## Reason for PSL Inclusion
<!--
Please tell us why your domain(s) should be listed in the PSL
(i.e. Cookie Security, Let's Encrypt issuance, iOS/Facebook, 
Cloudflare, etc.) and clearly confirm that any private section 
names hold registration term longer than 2 years and shall 
maintain more than 1 year term in order to remain listed.

If you are attempting to work around third party limits, use 
this area to describe how and detail the manner in which you 
have first attempted to engage those third parties on the 
matter.

Please also reference any past issues or PRs 
specifically related to this submission or section.

Provide three or more sentences here that describe the purpose 
for which your PR should be included in the PSL. There is no 
upper limit, but six paragraphs seems like a rational stop.
-->

<!-- FILL IN: Reason for PSL Inclusion (keep this line and its END FILL IN) -->
Cookie security between customers. When an agent exposes a port of its sandbox, the service answers at `https://sbx-<id>-<port>.sandboxhost.de`, and the code behind that name is the customer's own code, not ours. Each sandbox belongs to one customer, and different names under sandboxhost.de belong to different customers.

Without an entry in the PSL, browsers treat all of these names as one site. A service in one sandbox can answer with `Set-Cookie: session=...; Domain=sandboxhost.de`, or set the same cookie from JavaScript, and the browser then sends that cookie to every other sandbox. One customer could overwrite or plant session cookies in the service of another customer. Listing sandboxhost.de in the PRIVATE section makes every `sbx-<id>-<port>.sandboxhost.de` its own site, which is the same isolation that existing private entries give to other hosting platforms.

We checked other ways, and none of them covers this case. The `__Host-` cookie prefix only protects services whose code uses it, and we neither write nor control the code our customers run. Removing the `Domain` attribute from `Set-Cookie` in our proxy would not catch cookies that JavaScript sets in the browser. A separate registrable domain per sandbox is not feasible. The payment service already runs under a different domain (postyourprice.com), so this request concerns the sandbox names only; sandboxhost.de itself serves no website.

The product is new, and the user count below is small. We are submitting now because isolation between customers has to hold from the first customer on, not only once there are thousands of them.

sandboxhost.de was registered on 2026-11-15. Before this request was submitted, its registration was extended so that it has at least two years remaining on the day of submission, and we will keep more than one year remaining for as long as it is listed. We will keep the `_psl` TXT record in place.

There are no past issues or PRs for this domain. This request does not work around any third-party limit: certificates for these names come from Cloudflare's Origin CA, not from Let's Encrypt, and no vendor referred us to the PSL.
<!-- END FILL IN -->

**Number of THOUSANDS of distinct users this request is being made to serve:**
<!-- 
The guidelines state that PSL inclusion is considered only for 
projects that have achieved a minimum of 2000 - 3000 distinct 
users or more. 

To be clear, 'users' is the number of distinct individuals 
working directly with a relationship with the requestor in 
using subnames of the requested space, and is not measured 
as the count of the audience of users that would visit to 
or interact with the namespace(s).

Please provide us this count, and identify if this is current 
actual count or an estimate. -->
<!-- FILL IN: Number of thousands of distinct users (keep this line and its END FILL IN) -->
0 (current actual count: at most 1 accounts with at least one sandbox, our own test accounts included, measured 2026-11-16)

This is the current actual count from our production database, not an estimate.
<!-- END FILL IN -->

## DNS Verification
<!--
For each domain you'd like to add to the list please create
a DNS verification record pointing to your pull request.

For example, if you'd like to add example.com and example.net
you would need to provide the following verifications:

```
dig +short TXT _psl.example.com
"https://github.com/publicsuffix/list/pull/XXXX"
```

```
dig +short TXT _psl.example.net
"https://github.com/publicsuffix/list/pull/XXXX"
```

Note that XXXX is replaced with the number of your pull request.

We ask that you leave this record in place while you want 
your entry to remain in the PSL, so that future (TBD) 
automation can remove entries where the record is not present.
-->
<!-- FILL IN: DNS verification records (keep this line and its END FILL IN) -->
```
dig +short TXT _psl.sandboxhost.de
"https://github.com/publicsuffix/list/pull/XXXX"
```
<!-- END FILL IN -->
