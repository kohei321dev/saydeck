create table if not exists scene_cards (
  id text primary key,
  category text not null,
  scene_ja text not null,
  prompt_en text not null,
  prompt_ja text not null default '',
  tags jsonb not null default '[]'::jsonb check (jsonb_typeof(tags) = 'array'),
  levels jsonb not null default '[]'::jsonb check (jsonb_typeof(levels) = 'array'),
  source text not null default 'sample' check (source in ('sample', 'owner')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scene_cards_source_position_idx
  on scene_cards (source, position, id);

insert into scene_cards (
  id,
  category,
  scene_ja,
  prompt_en,
  prompt_ja,
  tags,
  levels,
  source,
  position
)
values
  (
    $$skate-001$$,
    $$introduction$$,
    $$初対面のスケーターに自己紹介する$$,
    $$Introduce yourself to a skater you just met.$$,
    $$初対面のスケーターに自己紹介してください。$$,
    $$["intro", "park"]$$::jsonb,
    $$[
      {"level":"L1","name":"Verb focus","constraints":"1 sentence, 4-7 words, use simple verbs","answerEn":"Hi, I skate here sometimes.","answerJa":"こんにちは。僕はここで時々滑ります。","reviewPoints":"Use I + verb + place/time."},
      {"level":"L2","name":"Add detail","constraints":"1 sentence, add one adjective","answerEn":"Hi, I skate at this small park sometimes.","answerJa":"こんにちは。僕はこの小さいパークで時々滑ります。","reviewPoints":"Add one adjective before a noun."},
      {"level":"L3","name":"Reason","constraints":"2 sentences, add experience","answerEn":"Hi, I skate here sometimes. I have skated for about fifteen years.","answerJa":"こんにちは。僕はここで時々滑ります。15年くらいスケボーをしています。","reviewPoints":"Use present perfect for experience."},
      {"level":"L4","name":"Conversation","constraints":"2 sentences, add a question","answerEn":"Hi, I skate here sometimes. What trick are you practicing today?","answerJa":"こんにちは。僕はここで時々滑ります。今日は何の技を練習していますか。","reviewPoints":"End with a simple question."}
    ]$$::jsonb,
    $$sample$$,
    1
  ),
  (
    $$skate-002$$,
    $$question$$,
    $$相手が練習している技を聞く$$,
    $$Ask what trick the other person is practicing.$$,
    $$相手が何の技を練習しているか聞いてください。$$,
    $$["question", "trick"]$$::jsonb,
    $$[
      {"level":"L1","name":"Verb focus","constraints":"1 question, 4-6 words","answerEn":"What trick are you practicing?","answerJa":"何の技を練習していますか。","reviewPoints":"Use What + noun + are you -ing?"},
      {"level":"L2","name":"Add detail","constraints":"1 question, add today","answerEn":"What trick are you practicing today?","answerJa":"今日は何の技を練習していますか。","reviewPoints":"Add time expression at the end."},
      {"level":"L3","name":"Reason","constraints":"2 sentences, add interest","answerEn":"What trick are you practicing today? It looks fun.","answerJa":"今日は何の技を練習していますか。楽しそうに見えます。","reviewPoints":"Use It looks + adjective."},
      {"level":"L4","name":"Conversation","constraints":"2 questions, ask follow-up","answerEn":"What trick are you practicing today? Is it hard?","answerJa":"今日は何の技を練習していますか。難しいですか。","reviewPoints":"Ask a short follow-up question."}
    ]$$::jsonb,
    $$sample$$,
    2
  ),
  (
    $$skate-003$$,
    $$compliment$$,
    $$相手の技をほめる$$,
    $$Compliment someone's trick.$$,
    $$相手の技をほめてください。$$,
    $$["compliment"]$$::jsonb,
    $$[
      {"level":"L1","name":"Verb focus","constraints":"1 sentence, 3-5 words","answerEn":"That looked good.","answerJa":"今のよかったです。","reviewPoints":"Use That looked + adjective."},
      {"level":"L2","name":"Add detail","constraints":"1 sentence, add specific noun","answerEn":"That kickflip looked clean.","answerJa":"今のキックフリップはきれいでした。","reviewPoints":"Name the trick if you can."},
      {"level":"L3","name":"Reason","constraints":"2 sentences, add reason","answerEn":"That kickflip looked clean. Your landing was smooth.","answerJa":"今のキックフリップはきれいでした。着地がスムーズでした。","reviewPoints":"Use a reason with a second sentence."},
      {"level":"L4","name":"Conversation","constraints":"2 sentences, add request","answerEn":"That kickflip looked clean. Can I see it again?","answerJa":"今のキックフリップはきれいでした。もう一回見せてもらえますか。","reviewPoints":"Add Can I ...? for a natural follow-up."}
    ]$$::jsonb,
    $$sample$$,
    3
  ),
  (
    $$skate-004$$,
    $$experience$$,
    $$自分のスケボー歴を伝える$$,
    $$Tell someone how long you have been skating.$$,
    $$自分のスケボー歴を伝えてください。$$,
    $$["experience"]$$::jsonb,
    $$[
      {"level":"L1","name":"Verb focus","constraints":"1 sentence, 5-8 words","answerEn":"I have skated for fifteen years.","answerJa":"15年スケボーをしています。","reviewPoints":"Use have + past participle + for."},
      {"level":"L2","name":"Add detail","constraints":"1 sentence, add about","answerEn":"I have skated for about fifteen years.","answerJa":"15年くらいスケボーをしています。","reviewPoints":"Use about for approximate years."},
      {"level":"L3","name":"Reason","constraints":"2 sentences, add current focus","answerEn":"I have skated for about fifteen years. Now I practice basic tricks again.","answerJa":"15年くらいスケボーをしています。今は基本の技をまた練習しています。","reviewPoints":"Add now to talk about current practice."},
      {"level":"L4","name":"Conversation","constraints":"2 sentences, add question","answerEn":"I have skated for about fifteen years. How long have you been skating?","answerJa":"15年くらいスケボーをしています。あなたはどのくらいやっていますか。","reviewPoints":"Mirror the same question to the other person."}
    ]$$::jsonb,
    $$sample$$,
    4
  ),
  (
    $$skate-005$$,
    $$invite$$,
    $$一緒に滑ろうと誘う$$,
    $$Invite someone to skate together.$$,
    $$一緒に滑ろうと誘ってください。$$,
    $$["invite"]$$::jsonb,
    $$[
      {"level":"L1","name":"Verb focus","constraints":"1 sentence, 3-5 words","answerEn":"Let's skate together.","answerJa":"一緒に滑りましょう。","reviewPoints":"Use Let's + verb."},
      {"level":"L2","name":"Add detail","constraints":"1 sentence, add time","answerEn":"Let's skate together after this.","answerJa":"この後一緒に滑りましょう。","reviewPoints":"Add a time phrase at the end."},
      {"level":"L3","name":"Reason","constraints":"2 sentences, add reason","answerEn":"Let's skate together after this. I want to try that line.","answerJa":"この後一緒に滑りましょう。あのラインを試したいです。","reviewPoints":"Use want to + verb."},
      {"level":"L4","name":"Conversation","constraints":"2 sentences, make it polite","answerEn":"Do you want to skate together after this? I want to try that line.","answerJa":"この後一緒に滑りませんか。あのラインを試したいです。","reviewPoints":"Use Do you want to ...? for a casual invitation."}
    ]$$::jsonb,
    $$sample$$,
    5
  ),
  (
    $$skate-006$$,
    $$trouble$$,
    $$転んだ後に大丈夫だと伝える$$,
    $$Say you are okay after falling.$$,
    $$転んだ後に大丈夫だと伝えてください。$$,
    $$["fall", "health"]$$::jsonb,
    $$[
      {"level":"L1","name":"Verb focus","constraints":"1 sentence, 3-5 words","answerEn":"I'm okay.","answerJa":"大丈夫です。","reviewPoints":"Use I'm + adjective."},
      {"level":"L2","name":"Add detail","constraints":"1 sentence, add body part","answerEn":"I'm okay. My knee hurts a little.","answerJa":"大丈夫です。膝が少し痛いです。","reviewPoints":"Use My + body part + hurts."},
      {"level":"L3","name":"Reason","constraints":"2 sentences, add plan","answerEn":"I'm okay. My knee hurts a little, so I will rest.","answerJa":"大丈夫です。膝が少し痛いので休みます。","reviewPoints":"Use so for result."},
      {"level":"L4","name":"Conversation","constraints":"2 sentences, add thanks","answerEn":"I'm okay, thanks. My knee hurts a little, so I will rest for a minute.","answerJa":"大丈夫です、ありがとう。膝が少し痛いので少し休みます。","reviewPoints":"Add thanks and for a minute."}
    ]$$::jsonb,
    $$sample$$,
    6
  ),
  (
    $$skate-007$$,
    $$small-talk$$,
    $$外国人の友達に今日の練習メニューを話す$$,
    $$Tell a foreign friend what you want to practice today.$$,
    $$外国人の友達に、今日何を練習したいか伝えてください。$$,
    $$["friend", "practice"]$$::jsonb,
    $$[
      {"level":"L1","name":"Verb focus","constraints":"1 sentence, 5-8 words","answerEn":"I want to practice ollies today.","answerJa":"今日はオーリーを練習したいです。","reviewPoints":"Use I want to + verb."},
      {"level":"L2","name":"Add detail","constraints":"1 sentence, add one adjective","answerEn":"I want to practice higher ollies today.","answerJa":"今日はもっと高いオーリーを練習したいです。","reviewPoints":"Add one adjective before the trick."},
      {"level":"L3","name":"Reason","constraints":"2 sentences, add reason","answerEn":"I want to practice higher ollies today because my timing is weak.","answerJa":"タイミングが弱いので、今日はもっと高いオーリーを練習したいです。","reviewPoints":"Use because to explain the reason."},
      {"level":"L4","name":"Conversation","constraints":"2 sentences, add a question","answerEn":"I want to practice higher ollies today. Can you watch my timing?","answerJa":"今日はもっと高いオーリーを練習したいです。タイミングを見てもらえますか。","reviewPoints":"Add Can you ...? to make it conversational."}
    ]$$::jsonb,
    $$sample$$,
    7
  )
on conflict (id) do update set
  category = excluded.category,
  scene_ja = excluded.scene_ja,
  prompt_en = excluded.prompt_en,
  prompt_ja = excluded.prompt_ja,
  tags = excluded.tags,
  levels = excluded.levels,
  source = excluded.source,
  position = excluded.position,
  updated_at = now()
where scene_cards.source = 'sample';
