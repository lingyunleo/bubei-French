/* Original learning examples for this project. Browser speech is explicitly marked TTS.
 * This is a practical starter list, not a statistically ranked frequency corpus. */
(function (global) {
  'use strict';
  const rows = [
    ['être','ɛtʁ','v.','是；处于','être + 形容词；être à + 地点','Je suis prêt pour le cours.','我准备好上课了。'],
    ['avoir','avwaʁ','v.','有','avoir besoin de + 名词 / 动词原形：需要','Nous avons besoin de temps.','我们需要时间。'],
    ['aller','ale','v.','去；（身体、情况）好','aller à + 地点；aller + 动词原形：即将','Je vais à la bibliothèque.','我去图书馆。'],
    ['faire','fɛʁ','v.','做；进行','faire attention à：注意','Fais attention à la marche.','小心台阶。'],
    ['dire','diʁ','v.','说；告诉','dire quelque chose à quelqu’un：告诉某人某事','Elle me dit la vérité.','她告诉我真相。'],
    ['pouvoir','puvwaʁ','v.','能够；可以','pouvoir + 动词原形；je peux / nous pouvons','Vous pouvez entrer maintenant.','您现在可以进来了。'],
    ['vouloir','vulwaʁ','v.','想要','vouloir + 名词 / 动词原形；je voudrais 用于礼貌请求','Je voudrais un verre d’eau.','我想要一杯水。'],
    ['savoir','savwaʁ','v.','知道；会（做某事）','savoir + 动词原形：会做；savoir que：知道……','Tu sais où se trouve la gare ?','你知道火车站在哪儿吗？'],
    ['voir','vwaʁ','v.','看见；见面','voir quelqu’un；on verra：到时候再看','Je vois la mer depuis ma fenêtre.','从我的窗户可以看到大海。'],
    ['venir','vəniʁ','v.','来','venir de + 地点：来自；venir de + 动词原形：刚刚做完','Il vient de rentrer.','他刚回来。'],
    ['prendre','pʁɑ̃dʁ','v.','拿；乘坐；吃喝','prendre le train；prendre un café','Nous prenons le train à huit heures.','我们八点坐火车。'],
    ['donner','dɔne','v.','给；提供','donner quelque chose à quelqu’un','Elle donne un livre à son frère.','她给弟弟一本书。'],
    ['parler','paʁle','v.','说话；谈论','parler à / avec quelqu’un；parler de quelque chose','Nous parlons de notre voyage.','我们在谈论我们的旅行。'],
    ['aimer','eme','v.','喜欢；爱','aimer + 名词 / 动词原形','J’aime lire dans le train.','我喜欢在火车上读书。'],
    ['manger','mɑ̃ʒe','v.','吃','manger quelque chose；变位 nous mangeons','Nous mangeons ensemble ce soir.','我们今晚一起吃饭。'],
    ['boire','bwaʁ','v.','喝','boire de l’eau；je bois / nous buvons','Je bois de l’eau après le sport.','运动后我喝水。'],
    ['travailler','tʁavaje','v.','工作；学习用功','travailler à / dans；travailler sur un projet','Elle travaille sur un nouveau projet.','她正在做一个新项目。'],
    ['apprendre','apʁɑ̃dʁ','v.','学习；获悉','apprendre à + 动词原形：学会做','J’apprends à parler français.','我在学说法语。'],
    ['comprendre','kɔ̃pʁɑ̃dʁ','v.','理解；包含','comprendre quelque chose；je comprends','Je comprends mieux avec un exemple.','有例子我就理解得更清楚。'],
    ['attendre','atɑ̃dʁ','v.','等待','attendre quelqu’un / quelque chose，直接接宾语','Je t’attends devant le cinéma.','我在电影院门口等你。'],
    ['chercher','ʃɛʁʃe','v.','寻找','chercher quelque chose；chercher à + 动词原形：设法','Je cherche mes clés.','我在找我的钥匙。'],
    ['trouver','tʁuve','v.','找到；认为','trouver quelque chose；trouver que：认为……','Je trouve cette idée intéressante.','我觉得这个想法很有意思。'],
    ['partir','paʁtiʁ','v.','出发；离开','partir pour + 目的地；partir de + 出发地','Nous partons pour Lyon demain.','我们明天出发去里昂。'],
    ['rester','ʁɛste','v.','留下；保持','rester à la maison；rester + 形容词','Je reste à la maison aujourd’hui.','我今天待在家里。'],
    ['mettre','mɛtʁ','v.','放；穿上','mettre quelque chose quelque part；mettre du temps à：花时间做','Mets ton livre sur la table.','把你的书放在桌上。'],
    ['jour','ʒuʁ','n.m.','一天；白天','tous les jours：每天；un jour：某一天','Je marche trente minutes tous les jours.','我每天步行三十分钟。'],
    ['temps','tɑ̃','n.m.','时间；天气','avoir le temps de：有时间做；quel temps fait-il ?：天气怎样？','Nous avons le temps de prendre un café.','我们有时间喝杯咖啡。'],
    ['personne','pɛʁsɔn','n.f.','人','une personne；作名词时始终为阴性','Trois personnes attendent devant la porte.','三个人在门口等着。'],
    ['chose','ʃoz','n.f.','事物；事情','quelque chose：某事物；autre chose：别的东西','J’ai quelque chose à te dire.','我有件事要告诉你。'],
    ['maison','mɛzɔ̃','n.f.','房子；家','à la maison：在家；rentrer à la maison：回家','Sa maison est près de la gare.','他的房子在火车站附近。'],
    ['travail','tʁavaj','n.m.','工作；劳动','au travail：在工作；复数 travaux','Je vais au travail à vélo.','我骑自行车去上班。'],
    ['ami','ami','n.m. / n.f.','朋友','un ami / une amie；朋友的性别决定词形','Une amie m’aide à préparer le repas.','一位女性朋友帮我准备饭菜。','ami','amie'],
    ['eau','o','n.f.','水','de l’eau；un verre d’eau：一杯水','L’eau de cette fontaine est potable.','这个饮水泉的水可以喝。'],
    ['livre','livʁ','n.m.','书','lire un livre；un livre de français','Ce livre explique bien la grammaire.','这本书把语法解释得很清楚。'],
    ['école','ekɔl','n.f.','学校','aller à l’école；à l’école：在学校','Les enfants vont à l’école à pied.','孩子们步行去上学。'],
    ['question','kɛstjɔ̃','n.f.','问题；提问','poser une question：提问','Puis-je poser une question ?','我可以问一个问题吗？'],
    ['réponse','ʁepɔ̃s','n.f.','回答；答案','la réponse à une question：问题的答案','Je ne connais pas encore la réponse.','我还不知道答案。'],
    ['ville','vil','n.f.','城市','en ville：在城里；le centre-ville：市中心','Cette ville possède un grand musée.','这座城市有一座大博物馆。'],
    ['pays','pei','n.m.','国家；地区','un pays / des pays，单复数拼写相同','Je voudrais découvrir ce pays.','我想了解这个国家。'],
    ['famille','famij','n.f.','家庭；家人','en famille：与家人一起','Nous passons le dimanche en famille.','我们和家人一起过星期天。'],
    ['petit','pəti','adj.','小的','petit / petite；通常放在名词前','Nous habitons dans une petite maison.','我们住在一栋小房子里。','petit','petite'],
    ['grand','ɡʁɑ̃','adj.','大的；高的','grand / grande；通常放在名词前','Cette chambre a une grande fenêtre.','这个房间有一扇大窗户。','grand','grande'],
    ['bon','bɔ̃','adj.','好的；好吃的','bon / bonne；bon à + 动词原形','C’est une bonne idée.','这是个好主意。','bon','bonne'],
    ['nouveau','nuvo','adj.','新的','nouveau / nouvelle；阳性单数元音或哑音 h 前用 nouvel','Il cherche un nouvel appartement.','他在找一套新公寓。','nouveau','nouvelle'],
    ['heureux','øʁø','adj.','幸福的；高兴的','heureux / heureuse；être heureux de + 动词原形','Je suis heureuse de vous revoir.','很高兴再次见到您。','heureux','heureuse'],
    ['important','ɛ̃pɔʁtɑ̃','adj.','重要的','important / importante；il est important de + 动词原形','Il est important de bien dormir.','睡好觉很重要。','important','importante'],
    ['aujourd’hui','oʒuʁdɥi','adv.','今天','aujourd’hui，撇号前后不留空格','Aujourd’hui, je termine ce travail.','今天我完成这项工作。'],
    ['demain','dəmɛ̃','adv.','明天','demain matin：明天早上；à demain：明天见','Le magasin sera ouvert demain.','商店明天会开门。'],
    ['toujours','tuʒuʁ','adv.','总是；仍然','toujours + 动词 / 形容词；pas toujours：不总是','Elle arrive toujours à l’heure.','她总是准时到。'],
    ['beaucoup','boku','adv.','很多；非常','beaucoup de + 名词；beaucoup + 动词','J’ai beaucoup de choses à apprendre.','我有很多东西要学。']
  ];
  // Match the inflected word actually present in each example, not just its dictionary form.
  const targets = {
    'être':'suis', 'avoir':'avons', 'aller':'vais', 'faire':'Fais', 'dire':'dit',
    'pouvoir':'pouvez', 'vouloir':'voudrais', 'savoir':'sais', 'voir':'vois', 'venir':'vient',
    'prendre':'prenons', 'donner':'donne', 'parler':'parlons', 'aimer':'aime', 'manger':'mangeons',
    'boire':'bois', 'travailler':'travaille', 'apprendre':'apprends', 'comprendre':'comprends', 'attendre':'attends',
    'chercher':'cherche', 'trouver':'trouve', 'partir':'partons', 'rester':'reste', 'mettre':'Mets',
    'jour':'jours', 'temps':'temps', 'personne':'personnes', 'chose':'chose', 'maison':'maison',
    'travail':'travail', 'ami':'amie', 'eau':'eau', 'livre':'livre', 'école':'école',
    'question':'question', 'réponse':'réponse', 'ville':'ville', 'pays':'pays', 'famille':'famille',
    'petit':'petite', 'grand':'grande', 'bon':'bonne', 'nouveau':'nouvel', 'heureux':'heureuse',
    'important':'important', 'aujourd’hui':'Aujourd’hui', 'demain':'demain', 'toujours':'toujours', 'beaucoup':'beaucoup'
  };
  global.VocabSeed = rows.map((r, i) => ({
    id: 'seed-fr-' + String(i + 1).padStart(3, '0'), french: r[0], spell: r[0], phonetic: '/' + r[1] + '/', pos: r[2], meaning: r[3], usage: r[4], example: r[5], exampleZh: r[6],
    masc: r[7] || '', fem: r[8] || '', hasGender: !!r[7], source: '项目自编入门词表；例句为自编示例',
    contexts: [{ id: 'seed-context-' + (i + 1), text: r[5], translation: r[6], target: targets[r[0]], type: 'tts', source: '项目自编例句', sourceUrl: '', author: '', license: '项目自编学习示例', audioUrl: '', audioId: '' }]
  }));
  const additionalExamples = [
  [
    "être",
    "Elle est à la maison.",
    "她在家。",
    "est"
  ],
  [
    "avoir",
    "Tu as une question ?",
    "你有问题吗？",
    "as"
  ],
  [
    "faire",
    "Nous faisons une pause.",
    "我们休息一会儿。",
    "faisons"
  ],
  [
    "dire",
    "Que voulez-vous dire ?",
    "您想表达什么？",
    "dire"
  ],
  [
    "pouvoir",
    "Je peux vous aider.",
    "我可以帮您。",
    "peux"
  ],
  [
    "vouloir",
    "Elle veut apprendre le français.",
    "她想学法语。",
    "veut"
  ],
  [
    "savoir",
    "Nous savons la réponse.",
    "我们知道答案。",
    "savons"
  ],
  [
    "voir",
    "Tu vois le petit café là-bas ?",
    "你看到那边的那家小咖啡馆了吗？",
    "vois"
  ],
  [
    "venir",
    "Venez avec nous.",
    "请跟我们一起来。",
    "Venez"
  ],
  [
    "prendre",
    "Je prends un café sans sucre.",
    "我要一杯不加糖的咖啡。",
    "prends"
  ],
  [
    "donner",
    "Pouvez-vous me donner votre adresse ?",
    "您能把您的地址告诉我吗？",
    "donner"
  ],
  [
    "parler",
    "Elle parle doucement.",
    "她轻声说话。",
    "parle"
  ],
  [
    "aimer",
    "Ils aiment se promener le soir.",
    "他们喜欢晚上散步。",
    "aiment"
  ],
  [
    "manger",
    "Je mange une pomme.",
    "我在吃一个苹果。",
    "mange"
  ],
  [
    "boire",
    "Tu veux boire quelque chose ?",
    "你想喝点什么吗？",
    "boire"
  ],
  [
    "travailler",
    "Nous travaillons dans la même équipe.",
    "我们在同一个团队工作。",
    "travaillons"
  ],
  [
    "apprendre",
    "Elle apprend un nouveau mot chaque jour.",
    "她每天学一个新词。",
    "apprend"
  ],
  [
    "comprendre",
    "Tu comprends cette phrase ?",
    "你理解这个句子吗？",
    "comprends"
  ],
  [
    "attendre",
    "Attendez ici, s’il vous plaît.",
    "请在这里等。",
    "Attendez"
  ],
  [
    "chercher",
    "Elle cherche un appartement près du centre.",
    "她在找一套靠近市中心的公寓。",
    "cherche"
  ],
  [
    "trouver",
    "Tu as trouvé tes lunettes ?",
    "你找到你的眼镜了吗？",
    "trouvé"
  ],
  [
    "partir",
    "Le bus part dans cinq minutes.",
    "公交车五分钟后出发。",
    "part"
  ],
  [
    "rester",
    "Il reste encore un peu de pain.",
    "还剩一点面包。",
    "reste"
  ],
  [
    "mettre",
    "Je mets mon manteau avant de sortir.",
    "我出门前穿上大衣。",
    "mets"
  ],
  [
    "jour",
    "Le musée est fermé ce jour-là.",
    "博物馆那天不开放。",
    "jour"
  ],
  [
    "temps",
    "Quel temps fait-il chez vous ?",
    "你们那里天气怎么样？",
    "temps"
  ],
  [
    "personne",
    "Cette personne parle trois langues.",
    "这个人会说三种语言。",
    "personne"
  ],
  [
    "chose",
    "La chose la plus importante est de commencer.",
    "最重要的事情是开始行动。",
    "chose"
  ],
  [
    "maison",
    "Nous rentrons à la maison.",
    "我们回家。",
    "maison"
  ],
  [
    "travail",
    "Ce travail demande de la patience.",
    "这项工作需要耐心。",
    "travail"
  ],
  [
    "ami",
    "Mon ami habite dans cette rue.",
    "我的朋友住在这条街上。",
    "ami"
  ],
  [
    "eau",
    "Tu veux de l’eau fraîche ?",
    "你想喝点凉水吗？",
    "eau"
  ],
  [
    "livre",
    "J’emprunte deux livres à la bibliothèque.",
    "我从图书馆借两本书。",
    "livres"
  ],
  [
    "école",
    "L’école ouvre à huit heures.",
    "学校八点开门。",
    "école"
  ],
  [
    "question",
    "Cette question est difficile.",
    "这个问题很难。",
    "question"
  ],
  [
    "réponse",
    "Merci pour votre réponse.",
    "谢谢您的回复。",
    "réponse"
  ],
  [
    "ville",
    "Nous visitons une nouvelle ville.",
    "我们游览一座没去过的城市。",
    "ville"
  ],
  [
    "pays",
    "Dans quel pays habitez-vous ?",
    "您住在哪个国家？",
    "pays"
  ],
  [
    "famille",
    "Ma famille habite à Paris.",
    "我的家人住在巴黎。",
    "famille"
  ],
  [
    "petit",
    "Je voudrais un petit café.",
    "我想要一小杯咖啡。",
    "petit"
  ],
  [
    "grand",
    "Son frère est très grand.",
    "他的兄弟个子很高。",
    "grand"
  ],
  [
    "bon",
    "Ce pain est très bon.",
    "这个面包很好吃。",
    "bon"
  ],
  [
    "nouveau",
    "J’ai une nouvelle adresse.",
    "我有了新地址。",
    "nouvelle"
  ],
  [
    "heureux",
    "Les enfants sont heureux de jouer ensemble.",
    "孩子们很高兴能一起玩。",
    "heureux"
  ],
  [
    "important",
    "C’est une décision importante.",
    "这是一个重要的决定。",
    "importante"
  ],
  [
    "aujourd’hui",
    "Le café est fermé aujourd’hui.",
    "咖啡馆今天不营业。",
    "aujourd’hui"
  ],
  [
    "demain",
    "On se retrouve demain matin.",
    "我们明天早上再见。",
    "demain"
  ],
  [
    "toujours",
    "Tu habites toujours à Lyon ?",
    "你还住在里昂吗？",
    "toujours"
  ],
  [
    "beaucoup",
    "Merci beaucoup pour ton aide.",
    "非常感谢你的帮助。",
    "beaucoup"
  ]
];
  for (const [french, text, translation, target] of additionalExamples) {
    const word = global.VocabSeed.find(item => item.french === french);
    word.contexts.push({ id: 'extra-' + word.id, text, translation, target, type: 'tts', source: '项目自编例句', sourceUrl: '', author: '', license: '项目自编学习示例', audioUrl: '', audioId: '' });
  }
  global.VocabSeed.find(word => word.french === 'aller').contexts.push({
    id: 'commons-comment-allez-vous', text: 'Comment allez-vous ?', translation: '您好吗？', target: 'allez', type: 'human',
    source: 'The Shtooka Project / Wikimedia Commons',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Fr-comment-allez%E2%80%90vous.ogg',
    author: 'Vion Nicolas', license: 'CC BY 2.0 France', licenseUrl: 'https://creativecommons.org/licenses/by/2.0/fr/',
    audioUrl: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/c/ca/Fr-comment-allez%E2%80%90vous.ogg/Fr-comment-allez%E2%80%90vous.ogg.mp3', audioId: 'builtin-comment-allez-vous',
    note: '真人短句朗读，不是影视片段；官方 MP3 转码，未剪辑，已内置可离线播放。'
  });
  global.VocabBuiltinMedia = [{"id":"builtin-comment-allez-vous","type":"audio/mpeg","data":"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xI0sGSH40udQvFtaTVm6neU3iNee1b3x8Qo0bF8Wxr//2rff+c63L6yQpHsSkG/k1C/8C/xd7XE0Z9mHACs7+qoARZOnN4N2NDBIVi0xwpAEOQh40NfFx4NOGQzS7kQppjwADIQwQ4NzITDx81NRMPCzShow8FNJNwcVlE72gAgDUm2yDi0BaHMlGQeEAIsFBYsODAn5Q6iQLSLw//uQZOWA9aBl0Xs4YHoAAA0gAAABF2mZOfWXgAAAADSCgAAEyGyZ3J00Bhws0wUlk813WJWqqlWupvoQoKabYsOetIGfe9e8rWqpS1tQOEzygDhP6rGa5KxggBm8EOI6EDSjOdY2ylXcaYOy2WwKvSgWJAl2DJbYsyh2nmgV7pW8MQwray12hj79Nba8oklw0BXCS4cXT1M6ax+9V6W9NQ1WuW5yU00au3WHt/ADnOin2teHpMy+k3T/Yq5Xqec5rtrDPPeud12lrfa79XUrdW/llKJ6XSWRROT/I387N5c1ll//////////////zHXct2+d/88///////////y/8uXef/1u37BkKOSrCKZIgIAADFdTKqmZhkGFWEy5BMLDjxVQ2M0NnNDGi0wcWMdJzNEEACKAM0MkMWDlFjmls1JBSvOMlAaYgLgh3AOLMpgIFSqQJmMWY8QMXMAyWkwIMTLzKCtGAdgVAYdNmYIxsxD07zPGayDgoFTpVkQVhomCAA5jJu9GRYogEFikt37ZOwtAK1IvnIUDHKVUQRqorITi//vAZOwACe+Jy35vIAAAAA0gwAAAKn4NTfm8kEgAADSDAAAALVmKJTxVRUvmyhOZyYCaBGcqZmIGAC4BMKzatSSqcp4quiBKJlixLrkPTXjbTX9duJXKbFeT9rJhqO2HQYI5xeIaIeJb0LcRtWL06YbUGhORKadYVUsK5m7ymT/T0ts3HJdqRLMg92M3GZo8SmCxErGIPys5okqgCIsRiMPzjow1I2HRWPSfC9NSiHmiuE16VRGDorVxxrSqWarWa2OH//////////////P/////////////////7WMKIESFhRQgAki7wscEmRinBzHRpi5p2ZvS6PRhABiyhkiSFBhDiEL72WkM0eJwWw5CxkzOpTqNUUxNS8LLmvGghjGfqtqxv4kVrrBY1fh0/OI6247FblsjMEKzc5VlcZqvYtq6ZW3x9PGD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6pYQRqiAUMGUQxuECMKZNHQMDMYnYaJ3ocQw2CIX2s92GRK9VVSyJ/9pAZA7ZAeUXWNVQHNEURmWjWJgDgZFCcup/C8yDznocVNm2eOkcaUw7TAaOHUmhCSkRMaVg0qhUeKcIUMWVkvZCFgSf3puq1Y4k/lYpZ9VJUkUvkVWeqn8l4wSpchHSo4FhMnA6hwhz8s1BEiFJDMslrwWjLGkdO37lUl5mnn/1r+e3+V/jzHlqYl2S3vlFqpMiGXZqJlSAZSKR4d8mnR75To5pYUrhzVUBmZr7pYiDlaLfkggkVzWqaUxq1//+MRdV9YdwjUjpHekpLuLh4AR/J5RYGiEMrNTTRIpbU8TBFERNWWeyIhMm7Fao6Gc/0qFSWpUhSJkVqs2hukSJF5TQ0Kmv4ok0M8/irkt9KgedWVyqxlZUQRFS5SAMKqXQPCwibKUputAGAz9Q6Klb1ZWzK82hv/6lDrVjIBCBkSopUxBTUUz//uAZP8A9ZFpS/spHPIAAA0gAAABFZ2xJ8yk08AAADSAAAAELjk5LjVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+1Bk9Af0oGrG+yks8AAADSAAAAEAsAkKpIwAOAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV","name":"Comment allez-vous ?","source":"The Shtooka Project / Wikimedia Commons","sourceUrl":"https://commons.wikimedia.org/wiki/File:Fr-comment-allez%E2%80%90vous.ogg","author":"Vion Nicolas","license":"CC BY 2.0 France","licenseUrl":"https://creativecommons.org/licenses/by/2.0/fr/","text":"Comment allez-vous ?","translation":"您好吗？"}];
  global.VocabSeedInfo = { count: 50, exampleCount: 100, ttsExampleCount: 99, humanExampleCount: 1, level: '常用入门词', textSource: '项目自编；不是按语料统计的频率排行榜', audioCoverage: '50 个词条各有 2 条例句，共 100 条：99 条项目自编例句使用浏览器朗读；1 条有来源及许可的内置真人短句可离线播放。没有影视原声素材。' };
})(typeof window === 'undefined' ? globalThis : window);
