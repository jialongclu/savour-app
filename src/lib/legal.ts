/**
 * The legal terms, as content rather than markup.
 *
 * The source is a Termly export full of editor scaffolding — conditional
 * blocks, Word style attributes, nested spans that set Arial over and over.
 * None of that survives here: it is stored as structure so the screen can set
 * it in Savour's own type, and so a clause can be edited without going near a
 * `<bdt>` tag.
 *
 * The wording of every clause is the generator's, unchanged.
 */

export const TERMS_UPDATED = 'August 25, 2026';

export type Block =
  | { kind: 'h2'; text: string }
  | { kind: 'h3'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] };

export const TERMS: Block[] = [
  { kind: 'h2', text: 'Agreement to our legal terms' },
  {
    kind: 'p',
    text:
      'Savour is built and run by Jialong Lu, an independent developer ("Savour," "we," "us," ' +
      '"our") — not a company. We operate the mobile application Savour (the "App"), as well as ' +
      'any other related products and services that refer or link to these legal terms (the ' +
      '"Legal Terms") (collectively, the "Services").',
  },
  {
    kind: 'p',
    text:
      'Film cost money to buy and money to develop, so you thought before you pressed the ' +
      'shutter. Savour puts that back. A roll holds 12, 24 or 36 frames and not one more. You ' +
      'can share it — hand out a six-character code and fill it together — but nobody sees ' +
      'anything until the roll is full. Then it develops, all at once, and you get an album ' +
      'instead of a camera roll.',
  },
  {
    kind: 'p',
    text:
      'These Legal Terms constitute a legally binding agreement made between you, whether ' +
      'personally or on behalf of an entity ("you"), and Savour, concerning your access to ' +
      'and use of the Services. You agree that by accessing the Services, you have read, ' +
      'understood, and agreed to be bound by all of these Legal Terms. IF YOU DO NOT AGREE WITH ' +
      'ALL OF THESE LEGAL TERMS, THEN YOU ARE EXPRESSLY PROHIBITED FROM USING THE SERVICES AND ' +
      'YOU MUST DISCONTINUE USE IMMEDIATELY.',
  },
  {
    kind: 'p',
    text:
      'We will provide you with prior notice of any scheduled changes to the Services you are ' +
      'using. Changes to these Legal Terms will become effective seven (7) days after the notice ' +
      'is given, except if the changes apply to new functionality, security updates, bug fixes, ' +
      'and a court order, in which case the changes will be effective immediately. By continuing ' +
      'to use the Services after the effective date of any changes, you agree to be bound by the ' +
      'modified terms. If you disagree with such changes, you may terminate Services as per the ' +
      'section "Term and termination."',
  },
  {
    kind: 'p',
    text:
      'The Services are intended for users who are at least 13 years of age. All users who are ' +
      'minors in the jurisdiction in which they reside (generally under the age of 18) must have ' +
      'the permission of, and be directly supervised by, their parent or guardian to use the ' +
      'Services. If you are a minor, you must have your parent or guardian read and agree to ' +
      'these Legal Terms prior to you using the Services.',
  },

  { kind: 'h2', text: '1. Our services' },
  {
    kind: 'p',
    text:
      'The information provided when using the Services is not intended for distribution to or ' +
      'use by any person or entity in any jurisdiction or country where such distribution or use ' +
      'would be contrary to law or regulation or which would subject us to any registration ' +
      'requirement within such jurisdiction or country. Accordingly, those persons who choose to ' +
      'access the Services from other locations do so on their own initiative and are solely ' +
      'responsible for compliance with local laws, if and to the extent local laws are applicable.',
  },
  {
    kind: 'p',
    text:
      'The Services are not tailored to comply with industry-specific regulations (Health ' +
      'Insurance Portability and Accountability Act (HIPAA), Federal Information Security ' +
      'Management Act (FISMA), etc.), so if your interactions would be subjected to such laws, ' +
      'you may not use the Services. You may not use the Services in a way that would violate ' +
      'the Gramm-Leach-Bliley Act (GLBA).',
  },

  { kind: 'h2', text: '2. Intellectual property rights' },
  { kind: 'h3', text: 'Our intellectual property' },
  {
    kind: 'p',
    text:
      'We are the owner or the licensee of all intellectual property rights in our Services, ' +
      'including all source code, databases, functionality, software, website designs, audio, ' +
      'video, text, photographs, and graphics in the Services (collectively, the "Content"), as ' +
      'well as the trademarks, service marks, and logos contained therein (the "Marks"). Our ' +
      'Content and Marks are protected by copyright and trademark laws and treaties in the ' +
      'United States and around the world. The Content and Marks are provided in or through the ' +
      'Services "AS IS" for your personal, non-commercial use only.',
  },
  { kind: 'h3', text: 'Your use of our Services' },
  {
    kind: 'p',
    text:
      'Subject to your compliance with these Legal Terms, including the "Prohibited activities" ' +
      'section below, we grant you a non-exclusive, non-transferable, revocable license to:',
  },
  {
    kind: 'ul',
    items: [
      'access the Services; and',
      'download or print a copy of any portion of the Content to which you have properly gained access,',
    ],
  },
  { kind: 'p', text: 'solely for your personal, non-commercial use.' },
  {
    kind: 'p',
    text:
      'Except as set out in this section or elsewhere in our Legal Terms, no part of the Services ' +
      'and no Content or Marks may be copied, reproduced, aggregated, republished, uploaded, ' +
      'posted, publicly displayed, encoded, translated, transmitted, distributed, sold, licensed, ' +
      'or otherwise exploited for any commercial purpose whatsoever, without our express prior ' +
      'written permission. We reserve all rights not expressly granted to you in and to the ' +
      'Services, Content, and Marks. Any breach of these Intellectual Property Rights will ' +
      'constitute a material breach of our Legal Terms and your right to use our Services will ' +
      'terminate immediately.',
  },
  { kind: 'h3', text: 'Your submissions' },
  {
    kind: 'p',
    text:
      'By directly sending us any question, comment, suggestion, idea, feedback, or other ' +
      'information about the Services ("Submissions"), you agree to assign to us all intellectual ' +
      'property rights in such Submission. You agree that we shall own this Submission and be ' +
      'entitled to its unrestricted use and dissemination for any lawful purpose, commercial or ' +
      'otherwise, without acknowledgment or compensation to you.',
  },
  {
    kind: 'p',
    text:
      'You are responsible for what you post or upload. By sending us Submissions through any ' +
      'part of the Services you confirm that you have read and agree with our "Prohibited ' +
      'activities" section and will not post, send, publish, upload, or transmit through the ' +
      'Services any Submission that is illegal, harassing, hateful, harmful, defamatory, obscene, ' +
      'bullying, abusive, discriminatory, threatening to any person or group, sexually explicit, ' +
      'false, inaccurate, deceitful, or misleading; to the extent permissible by applicable law, ' +
      'waive any and all moral rights to any such Submission; warrant that any such Submission is ' +
      'original to you or that you have the necessary rights and licenses to submit it; and ' +
      'warrant that your Submissions do not constitute confidential information.',
  },

  { kind: 'h2', text: '3. User representations' },
  {
    kind: 'p',
    text:
      'By using the Services, you represent and warrant that: (1) all registration information ' +
      'you submit will be true, accurate, current, and complete; (2) you will maintain the ' +
      'accuracy of such information and promptly update such registration information as ' +
      'necessary; (3) you have the legal capacity and you agree to comply with these Legal Terms; ' +
      '(4) you are not under the age of 13; (5) you are not a minor in the jurisdiction in which ' +
      'you reside, or if a minor, you have received parental permission to use the Services; ' +
      '(6) you will not access the Services through automated or non-human means, whether through ' +
      'a bot, script or otherwise; (7) you will not use the Services for any illegal or ' +
      'unauthorized purpose; and (8) your use of the Services will not violate any applicable law ' +
      'or regulation.',
  },
  {
    kind: 'p',
    text:
      'If you provide any information that is untrue, inaccurate, not current, or incomplete, we ' +
      'have the right to suspend or terminate your account and refuse any and all current or ' +
      'future use of the Services (or any portion thereof).',
  },

  { kind: 'h2', text: '4. User registration' },
  {
    kind: 'p',
    text:
      'You may be required to register to use the Services. You agree to keep your password ' +
      'confidential and will be responsible for all use of your account and password. We reserve ' +
      'the right to remove, reclaim, or change a username you select if we determine, in our sole ' +
      'discretion, that such username is inappropriate, obscene, or otherwise objectionable.',
  },

  { kind: 'h2', text: '5. Purchases and payment' },
  {
    kind: 'p',
    text:
      'Every purchase is made through the App Store or Google Play, not through us. Your payment ' +
      'method, billing address, and card details are held by the store and are never sent to us ' +
      'or stored by us — we are told only that a purchase was made. The store sets the currency ' +
      'you are charged in, converts the price for your region, and collects any tax that applies ' +
      'where you live.',
  },
  {
    kind: 'p',
    text:
      'You agree to pay all charges at the prices then in effect for your purchases. Keeping your ' +
      'payment details current is a matter between you and the store; a purchase that the store ' +
      'declines simply does not happen. We may change prices at any time, and we reserve the right ' +
      'to correct any errors or mistakes in pricing, even if we have already requested or received ' +
      'payment.',
  },

  { kind: 'h2', text: '6. Subscriptions' },
  { kind: 'h3', text: 'Billing and renewal' },
  {
    kind: 'p',
    text:
      'Your subscription will continue and automatically renew unless canceled. You consent to ' +
      'the store charging your payment method on a recurring basis without requiring your prior ' +
      'approval for each recurring charge, until such time as you cancel the applicable order. ' +
      'The length of your billing cycle will depend on the type of subscription plan you choose ' +
      'when you subscribed to the Services.',
  },
  { kind: 'h3', text: 'Cancellation' },
  {
    kind: 'p',
    text:
      'You can cancel your subscription at any time through your App Store or Google Play account ' +
      'settings. Your cancellation will take effect at the end of the current paid term, and you ' +
      'keep what you paid for until then.',
  },
  {
    kind: 'p',
    text:
      'We do not process refunds, because we never received the payment — the store did. Refund ' +
      'requests go to the App Store or Google Play and are decided under their policies.',
  },
  { kind: 'h3', text: 'Fee changes' },
  {
    kind: 'p',
    text:
      'We may, from time to time, make changes to the subscription fee and will communicate any ' +
      'price changes to you in accordance with applicable law.',
  },

  { kind: 'h2', text: '7. Software' },
  {
    kind: 'p',
    text:
      'We may include software for use in connection with our Services. If such software is ' +
      'accompanied by an end user license agreement ("EULA"), the terms of the EULA will govern ' +
      'your use of the software. If such software is not accompanied by a EULA, then we grant to ' +
      'you a non-exclusive, revocable, personal, and non-transferable license to use such software ' +
      'solely in connection with our services and in accordance with these Legal Terms. Any ' +
      'software and any related documentation is provided "AS IS" without warranty of any kind, ' +
      'either express or implied. You accept any and all risk arising out of use or performance ' +
      'of any software.',
  },

  { kind: 'h2', text: '8. Prohibited activities' },
  {
    kind: 'p',
    text:
      'You may not access or use the Services for any purpose other than that for which we make ' +
      'the Services available. The Services may not be used in connection with any commercial ' +
      'endeavors except those that are specifically endorsed or approved by us. As a user of the ' +
      'Services, you agree not to:',
  },
  {
    kind: 'ul',
    items: [
      'Systematically retrieve data or other content from the Services to create or compile, directly or indirectly, a collection, compilation, database, or directory without written permission from us.',
      'Trick, defraud, or mislead us and other users, especially in any attempt to learn sensitive account information such as user passwords.',
      'Circumvent, disable, or otherwise interfere with security-related features of the Services.',
      'Disparage, tarnish, or otherwise harm, in our opinion, us and/or the Services.',
      'Use any information obtained from the Services in order to harass, abuse, or harm another person.',
      'Make improper use of our support services or submit false reports of abuse or misconduct.',
      'Use the Services in a manner inconsistent with any applicable laws or regulations.',
      'Engage in unauthorized framing of or linking to the Services.',
      'Upload or transmit viruses, Trojan horses, or other material that interferes with any party’s uninterrupted use and enjoyment of the Services.',
      'Engage in any automated use of the system, such as using scripts to send comments or messages, or using any data mining, robots, or similar tools.',
      'Delete the copyright or other proprietary rights notice from any Content.',
      'Attempt to impersonate another user or person or use the username of another user.',
      'Interfere with, disrupt, or create an undue burden on the Services or the networks or services connected to the Services.',
      'Harass, annoy, intimidate, or threaten anyone engaged in providing any portion of the Services to you.',
      'Attempt to bypass any measures of the Services designed to prevent or restrict access to the Services.',
      'Copy or adapt the Services’ software.',
      'Except as permitted by applicable law, decipher, decompile, disassemble, or reverse engineer any of the software comprising the Services.',
      'Make any unauthorized use of the Services, including collecting usernames or email addresses of users for the purpose of sending unsolicited email, or creating user accounts by automated means or under false pretenses.',
      'Use the Services as part of any effort to compete with us or otherwise use the Services and/or the Content for any revenue-generating endeavor or commercial enterprise.',
    ],
  },

  { kind: 'h2', text: '9. User generated contributions' },
  {
    kind: 'p',
    text:
      'We may provide you with the opportunity to create, submit, post, display, transmit, ' +
      'perform, publish, distribute, or broadcast content and materials to us or on the Services, ' +
      'including but not limited to text, writings, video, audio, photographs, graphics, comments, ' +
      'suggestions, or personal information or other material (collectively, "Contributions"). ' +
      'Contributions may be viewable by other users of the Services. When you create or make ' +
      'available any Contributions, you thereby represent and warrant that:',
  },
  {
    kind: 'ul',
    items: [
      'The creation, distribution, transmission, public display, or performance, and the accessing, downloading, or copying of your Contributions do not and will not infringe the proprietary rights of any third party.',
      'You are the creator and owner of or have the necessary licenses, rights, consents, releases, and permissions to use and to authorize us and other users to use your Contributions.',
      'You have the written consent, release, and/or permission of each and every identifiable individual person in your Contributions to use their name or likeness.',
      'Your Contributions are not false, inaccurate, or misleading.',
      'Your Contributions are not unsolicited or unauthorized advertising, promotional materials, pyramid schemes, chain letters, spam, or other forms of solicitation.',
      'Your Contributions are not obscene, lewd, lascivious, filthy, violent, harassing, libelous, slanderous, or otherwise objectionable (as determined by us).',
      'Your Contributions do not ridicule, mock, disparage, intimidate, or abuse anyone.',
      'Your Contributions are not used to harass or threaten any other person or to promote violence against a specific person or class of people.',
      'Your Contributions do not violate any applicable law, regulation, or rule.',
      'Your Contributions do not violate the privacy or publicity rights of any third party.',
      'Your Contributions do not violate any applicable law concerning child pornography, or otherwise intended to protect the health or well-being of minors.',
      'Your Contributions do not include any offensive comments that are connected to race, national origin, gender, sexual preference, or physical handicap.',
      'Your Contributions do not otherwise violate any provision of these Legal Terms, or any applicable law or regulation.',
    ],
  },
  {
    kind: 'p',
    text:
      'Any use of the Services in violation of the foregoing violates these Legal Terms and may ' +
      'result in, among other things, termination or suspension of your rights to use the Services.',
  },

  { kind: 'h2', text: '10. Contribution license' },
  {
    kind: 'p',
    text:
      'You and Services agree that we may access, store, process, and use any information and ' +
      'personal data that you provide and your choices (including settings). By submitting ' +
      'suggestions or other feedback regarding the Services, you agree that we can use and share ' +
      'such feedback for any purpose without compensation to you.',
  },
  {
    kind: 'p',
    text:
      'We do not assert any ownership over your Contributions. You retain full ownership of all ' +
      'of your Contributions and any intellectual property rights or other proprietary rights ' +
      'associated with your Contributions. We are not liable for any statements or ' +
      'representations in your Contributions provided by you in any area on the Services. You are ' +
      'solely responsible for your Contributions to the Services.',
  },

  { kind: 'h2', text: '11. Mobile application license' },
  { kind: 'h3', text: 'Use license' },
  {
    kind: 'p',
    text:
      'If you access the Services via the App, then we grant you a revocable, non-exclusive, ' +
      'non-transferable, limited right to install and use the App on wireless electronic devices ' +
      'owned or controlled by you, and to access and use the App on such devices strictly in ' +
      'accordance with the terms and conditions of this mobile application license contained in ' +
      'these Legal Terms. You shall not: (1) except as permitted by applicable law, decompile, ' +
      'reverse engineer, disassemble, attempt to derive the source code of, or decrypt the App; ' +
      '(2) make any modification, adaptation, improvement, enhancement, translation, or derivative ' +
      'work from the App; (3) violate any applicable laws, rules, or regulations in connection ' +
      'with your access or use of the App; (4) remove, alter, or obscure any proprietary notice ' +
      'posted by us or the licensors of the App; (5) use the App for any revenue-generating ' +
      'endeavor, commercial enterprise, or other purpose for which it is not designed or intended; ' +
      '(6) make the App available over a network or other environment permitting access or use by ' +
      'multiple devices or users at the same time; (7) use the App for creating a product, ' +
      'service, or software that is, directly or indirectly, competitive with or in any way a ' +
      'substitute for the App; (8) use the App to send automated queries to any website or to send ' +
      'any unsolicited commercial email; or (9) use any proprietary information or any of our ' +
      'interfaces or our other intellectual property in the design, development, manufacture, ' +
      'licensing, or distribution of any applications, accessories, or devices for use with the App.',
  },
  { kind: 'h3', text: 'Apple and Android devices' },
  {
    kind: 'p',
    text:
      'The following terms apply when you use the App obtained from either the Apple Store or ' +
      'Google Play (each an "App Distributor") to access the Services: (1) the license granted to ' +
      'you for our App is limited to a non-transferable license to use the application on a device ' +
      'that utilizes the Apple iOS or Android operating systems, as applicable, and in accordance ' +
      'with the usage rules set forth in the applicable App Distributor’s terms of service; (2) we ' +
      'are responsible for providing any maintenance and support services with respect to the App, ' +
      'and you acknowledge that each App Distributor has no obligation whatsoever to furnish any ' +
      'maintenance and support services with respect to the App; (3) in the event of any failure ' +
      'of the App to conform to any applicable warranty, you may notify the applicable App ' +
      'Distributor, and the App Distributor may refund the purchase price, if any, paid for the ' +
      'App, and will have no other warranty obligation whatsoever; (4) you represent and warrant ' +
      'that you are not located in a country that is subject to a US government embargo, or that ' +
      'has been designated by the US government as a "terrorist supporting" country, and that you ' +
      'are not listed on any US government list of prohibited or restricted parties; (5) you must ' +
      'comply with applicable third-party terms of agreement when using the App; and (6) you ' +
      'acknowledge and agree that the App Distributors are third-party beneficiaries of the terms ' +
      'and conditions in this mobile application license, and that each App Distributor will have ' +
      'the right to enforce them against you as a third-party beneficiary thereof.',
  },

  { kind: 'h2', text: '12. Third-party websites and content' },
  {
    kind: 'p',
    text:
      'The Services may contain (or you may be sent via the App) links to other websites ' +
      '("Third-Party Websites") as well as articles, photographs, text, graphics, pictures, ' +
      'designs, music, sound, video, information, applications, software, and other content or ' +
      'items belonging to or originating from third parties ("Third-Party Content"). Such ' +
      'Third-Party Websites and Third-Party Content are not investigated, monitored, or checked ' +
      'for accuracy, appropriateness, or completeness by us, and we are not responsible for any ' +
      'Third-Party Websites accessed through the Services or any Third-Party Content posted on, ' +
      'available through, or installed from the Services. Inclusion of, linking to, or permitting ' +
      'the use or installation of any Third-Party Websites or Third-Party Content does not imply ' +
      'approval or endorsement thereof by us. If you decide to leave the Services and access the ' +
      'Third-Party Websites or to use or install any Third-Party Content, you do so at your own ' +
      'risk, and you should be aware these Legal Terms no longer govern.',
  },

  { kind: 'h2', text: '13. Services management' },
  {
    kind: 'p',
    text:
      'We reserve the right, but not the obligation, to: (1) monitor the Services for violations ' +
      'of these Legal Terms; (2) take appropriate legal action against anyone who, in our sole ' +
      'discretion, violates the law or these Legal Terms, including without limitation, reporting ' +
      'such user to law enforcement authorities; (3) in our sole discretion and without ' +
      'limitation, refuse, restrict access to, limit the availability of, or disable (to the ' +
      'extent technologically feasible) any of your Contributions or any portion thereof; (4) in ' +
      'our sole discretion and without limitation, notice, or liability, to remove from the ' +
      'Services or otherwise disable all files and content that are excessive in size or are in ' +
      'any way burdensome to our systems; and (5) otherwise manage the Services in a manner ' +
      'designed to protect our rights and property and to facilitate the proper functioning of ' +
      'the Services.',
  },

  { kind: 'h2', text: '14. Privacy policy' },
  {
    kind: 'p',
    text:
      'We care about data privacy and security. By using the Services, you agree to be bound by ' +
      'our Privacy Policy posted on the Services, which is incorporated into these Legal Terms. ' +
      'Please be advised the Services are hosted in the United States. If you access the Services ' +
      'from any other region of the world with laws or other requirements governing personal data ' +
      'collection, use, or disclosure that differ from applicable laws in the United States, then ' +
      'through your continued use of the Services, you are transferring your data to the United ' +
      'States, and you expressly consent to have your data transferred to and processed in the ' +
      'United States. Further, we do not knowingly accept, request, or solicit information from ' +
      'children or knowingly market to children. Therefore, in accordance with the U.S. ' +
      'Children’s Online Privacy Protection Act, if we receive actual knowledge that anyone under ' +
      'the age of 13 has provided personal information to us without the requisite and verifiable ' +
      'parental consent, we will delete that information from the Services as quickly as is ' +
      'reasonably practical.',
  },

  { kind: 'h2', text: '15. Term and termination' },
  {
    kind: 'p',
    text:
      'These Legal Terms shall remain in full force and effect while you use the Services. ' +
      'WITHOUT LIMITING ANY OTHER PROVISION OF THESE LEGAL TERMS, WE RESERVE THE RIGHT TO, IN OUR ' +
      'SOLE DISCRETION AND WITHOUT NOTICE OR LIABILITY, DENY ACCESS TO AND USE OF THE SERVICES ' +
      '(INCLUDING BLOCKING CERTAIN IP ADDRESSES), TO ANY PERSON FOR ANY REASON OR FOR NO REASON, ' +
      'INCLUDING WITHOUT LIMITATION FOR BREACH OF ANY REPRESENTATION, WARRANTY, OR COVENANT ' +
      'CONTAINED IN THESE LEGAL TERMS OR OF ANY APPLICABLE LAW OR REGULATION. WE MAY TERMINATE ' +
      'YOUR USE OR PARTICIPATION IN THE SERVICES OR DELETE YOUR ACCOUNT AND ANY CONTENT OR ' +
      'INFORMATION THAT YOU POSTED AT ANY TIME, WITHOUT WARNING, IN OUR SOLE DISCRETION.',
  },
  {
    kind: 'p',
    text:
      'If we terminate or suspend your account for any reason, you are prohibited from ' +
      'registering and creating a new account under your name, a fake or borrowed name, or the ' +
      'name of any third party, even if you may be acting on behalf of the third party. In ' +
      'addition to terminating or suspending your account, we reserve the right to take ' +
      'appropriate legal action, including without limitation pursuing civil, criminal, and ' +
      'injunctive redress.',
  },

  { kind: 'h2', text: '16. Modifications and interruptions' },
  {
    kind: 'p',
    text:
      'We reserve the right to change, modify, or remove the contents of the Services at any time ' +
      'or for any reason at our sole discretion without notice. However, we have no obligation to ' +
      'update any information on our Services. We will not be liable to you or any third party ' +
      'for any modification, price change, suspension, or discontinuance of the Services.',
  },
  {
    kind: 'p',
    text:
      'We cannot guarantee the Services will be available at all times. We may experience ' +
      'hardware, software, or other problems or need to perform maintenance related to the ' +
      'Services, resulting in interruptions, delays, or errors. You agree that we have no ' +
      'liability whatsoever for any loss, damage, or inconvenience caused by your inability to ' +
      'access or use the Services during any downtime or discontinuance of the Services.',
  },

  { kind: 'h2', text: '17. Governing law' },
  {
    kind: 'p',
    text:
      'These Legal Terms shall be governed by and construed in accordance with the laws of the ' +
      'Province of Alberta and the federal laws of Canada applicable therein, without regard to ' +
      'their conflict of law provisions. You and we irrevocably consent that the courts of the ' +
      'Province of Alberta shall have exclusive jurisdiction to resolve any dispute which may ' +
      'arise in connection with these Legal Terms.',
  },

  { kind: 'h2', text: '18. Dispute resolution' },
  {
    kind: 'p',
    text:
      'You agree to irrevocably submit all disputes related to these Legal Terms or the legal ' +
      'relationship established by these Legal Terms to the jurisdiction of the courts of the ' +
      'Province of Alberta. We shall also maintain the right to bring proceedings as to the ' +
      'substance of the matter in the courts of the country where you reside or, if these Legal ' +
      'Terms are entered into in the course of your trade or profession, the state or province of ' +
      'your principal place of business.',
  },

  { kind: 'h2', text: '19. Corrections' },
  {
    kind: 'p',
    text:
      'There may be information on the Services that contains typographical errors, inaccuracies, ' +
      'or omissions, including descriptions, pricing, availability, and various other information. ' +
      'We reserve the right to correct any errors, inaccuracies, or omissions and to change or ' +
      'update the information on the Services at any time, without prior notice.',
  },

  { kind: 'h2', text: '20. Disclaimer' },
  {
    kind: 'p',
    text:
      'THE SERVICES ARE PROVIDED ON AN AS-IS AND AS-AVAILABLE BASIS. YOU AGREE THAT YOUR USE OF ' +
      'THE SERVICES WILL BE AT YOUR SOLE RISK. TO THE FULLEST EXTENT PERMITTED BY LAW, WE DISCLAIM ' +
      'ALL WARRANTIES, EXPRESS OR IMPLIED, IN CONNECTION WITH THE SERVICES AND YOUR USE THEREOF, ' +
      'INCLUDING, WITHOUT LIMITATION, THE IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A ' +
      'PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE MAKE NO WARRANTIES OR REPRESENTATIONS ABOUT ' +
      'THE ACCURACY OR COMPLETENESS OF THE SERVICES’ CONTENT AND WE WILL ASSUME NO LIABILITY OR ' +
      'RESPONSIBILITY FOR ANY (1) ERRORS, MISTAKES, OR INACCURACIES OF CONTENT AND MATERIALS, ' +
      '(2) PERSONAL INJURY OR PROPERTY DAMAGE RESULTING FROM YOUR ACCESS TO AND USE OF THE ' +
      'SERVICES, (3) ANY UNAUTHORIZED ACCESS TO OR USE OF OUR SECURE SERVERS AND/OR ANY PERSONAL ' +
      'OR FINANCIAL INFORMATION STORED THEREIN, (4) ANY INTERRUPTION OR CESSATION OF TRANSMISSION ' +
      'TO OR FROM THE SERVICES, (5) ANY BUGS, VIRUSES, TROJAN HORSES, OR THE LIKE WHICH MAY BE ' +
      'TRANSMITTED TO OR THROUGH THE SERVICES BY ANY THIRD PARTY, AND/OR (6) ANY ERRORS OR ' +
      'OMISSIONS IN ANY CONTENT AND MATERIALS OR FOR ANY LOSS OR DAMAGE OF ANY KIND INCURRED AS A ' +
      'RESULT OF THE USE OF ANY CONTENT POSTED, TRANSMITTED, OR OTHERWISE MADE AVAILABLE VIA THE ' +
      'SERVICES.',
  },

  { kind: 'h2', text: '21. Limitations of liability' },
  {
    kind: 'p',
    text:
      'IN NO EVENT WILL WE OR ANYONE WORKING ON OUR BEHALF BE LIABLE TO YOU OR ANY THIRD ' +
      'PARTY FOR ANY DIRECT, INDIRECT, CONSEQUENTIAL, EXEMPLARY, INCIDENTAL, SPECIAL, OR PUNITIVE ' +
      'DAMAGES, INCLUDING LOST PROFIT, LOST REVENUE, LOSS OF DATA, OR OTHER DAMAGES ARISING FROM ' +
      'YOUR USE OF THE SERVICES, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. ' +
      'NOTWITHSTANDING ANYTHING TO THE CONTRARY CONTAINED HEREIN, OUR LIABILITY TO YOU FOR ANY ' +
      'CAUSE WHATSOEVER AND REGARDLESS OF THE FORM OF THE ACTION, WILL AT ALL TIMES BE LIMITED TO ' +
      'THE AMOUNT PAID, IF ANY, BY YOU TO US DURING THE THREE (3) MONTH PERIOD PRIOR TO ANY CAUSE ' +
      'OF ACTION ARISING. CERTAIN US STATE LAWS AND INTERNATIONAL LAWS DO NOT ALLOW LIMITATIONS ON ' +
      'IMPLIED WARRANTIES OR THE EXCLUSION OR LIMITATION OF CERTAIN DAMAGES. IF THESE LAWS APPLY ' +
      'TO YOU, SOME OR ALL OF THE ABOVE DISCLAIMERS OR LIMITATIONS MAY NOT APPLY TO YOU, AND YOU ' +
      'MAY HAVE ADDITIONAL RIGHTS.',
  },

  { kind: 'h2', text: '22. Indemnification' },
  {
    kind: 'p',
    text:
      'You agree to defend, indemnify, and hold us harmless, including anyone working on our ' +
      'behalf, from and ' +
      'against any loss, damage, liability, claim, or demand, including reasonable attorneys’ fees ' +
      'and expenses, made by any third party due to or arising out of: (1) use of the Services; ' +
      '(2) breach of these Legal Terms; (3) any breach of your representations and warranties set ' +
      'forth in these Legal Terms; (4) your violation of the rights of a third party, including ' +
      'but not limited to intellectual property rights; or (5) any overt harmful act toward any ' +
      'other user of the Services with whom you connected via the Services.',
  },

  { kind: 'h2', text: '23. User data' },
  {
    kind: 'p',
    text:
      'We will maintain certain data that you transmit to the Services for the purpose of managing ' +
      'the performance of the Services, as well as data relating to your use of the Services. ' +
      'Although we perform regular routine backups of data, you are solely responsible for all ' +
      'data that you transmit or that relates to any activity you have undertaken using the ' +
      'Services. You agree that we shall have no liability to you for any loss or corruption of ' +
      'any such data, and you hereby waive any right of action against us arising from any such ' +
      'loss or corruption of such data.',
  },

  { kind: 'h2', text: '24. Electronic communications, transactions, and signatures' },
  {
    kind: 'p',
    text:
      'Visiting the Services, sending us emails, and completing online forms constitute electronic ' +
      'communications. You consent to receive electronic communications, and you agree that all ' +
      'agreements, notices, disclosures, and other communications we provide to you ' +
      'electronically, via email and on the Services, satisfy any legal requirement that such ' +
      'communication be in writing. YOU HEREBY AGREE TO THE USE OF ELECTRONIC SIGNATURES, ' +
      'CONTRACTS, ORDERS, AND OTHER RECORDS, AND TO ELECTRONIC DELIVERY OF NOTICES, POLICIES, AND ' +
      'RECORDS OF TRANSACTIONS INITIATED OR COMPLETED BY US OR VIA THE SERVICES.',
  },

  { kind: 'h2', text: '25. California users and residents' },
  {
    kind: 'p',
    text:
      'If any complaint with us is not satisfactorily resolved, you can contact the Complaint ' +
      'Assistance Unit of the Division of Consumer Services of the California Department of ' +
      'Consumer Affairs in writing at 1625 North Market Blvd., Suite N 112, Sacramento, ' +
      'California 95834 or by telephone at (800) 952-5210 or (916) 445-1254.',
  },

  { kind: 'h2', text: '26. Miscellaneous' },
  {
    kind: 'p',
    text:
      'These Legal Terms and any policies or operating rules posted by us on the Services or in ' +
      'respect to the Services constitute the entire agreement and understanding between you and ' +
      'us. Our failure to exercise or enforce any right or provision of these Legal Terms shall ' +
      'not operate as a waiver of such right or provision. These Legal Terms operate to the ' +
      'fullest extent permissible by law. We may assign any or all of our rights and obligations ' +
      'to others at any time. We shall not be responsible or liable for any loss, damage, delay, ' +
      'or failure to act caused by any cause beyond our reasonable control. If any provision or ' +
      'part of a provision of these Legal Terms is determined to be unlawful, void, or ' +
      'unenforceable, that provision or part of the provision is deemed severable from these ' +
      'Legal Terms and does not affect the validity and enforceability of any remaining ' +
      'provisions. There is no joint venture, partnership, employment or agency relationship ' +
      'created between you and us as a result of these Legal Terms or use of the Services.',
  },

  { kind: 'h2', text: '27. Contact us' },
  {
    kind: 'p',
    text:
      'In order to resolve a complaint regarding the Services or to receive further information ' +
      'regarding use of the Services, please contact us through the form linked from your ' +
      'Profile. Savour is one person, so the reply comes from that person.',
  },
  { kind: 'p', text: 'Savour, by Jialong Lu' },
];
