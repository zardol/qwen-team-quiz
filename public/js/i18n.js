(() => {
  const LANG_STORAGE_KEY = 'qwen_quiz_lang';

  const TRANSLATIONS = {
    ru: {
      page_title_student: 'Командный квиз — Участник',
      page_title_admin: 'Админ-панель — Командный квиз Qwen',
      default_quiz_title: 'Интерактивный квиз по философии',
      connecting: 'Подключение к серверу...',
      online: 'Онлайн',
      reconnecting: 'Переподключение...',
      change_name: 'Сменить имя',

      // Login screen
      login_welcome: 'Добро пожаловать в квиз!',
      login_subtitle: 'Введите ваше имя, чтобы создать команду или присоединиться к существующей.',
      your_name_label: 'Ваше имя',
      your_name_placeholder: 'Введите ваше имя',
      enter_quiz_btn: 'Войти в квиз',
      or_divider: 'или',
      enter_spectator_btn: '👀 Войти как наблюдатель',
      spectator_badge: '👀 Наблюдатель',
      become_player_btn: 'Стать участником',
      spectator_lobby_title: 'Ожидание начала квиза',
      spectator_lobby_hint: 'Команды собираются на своих устройствах. Ведущий скоро запустит первый раунд.',
      spectator_round_hidden_msg: '💬 Команды обсуждают вопрос и готовят ответ.',
      spectator_locked_msg: '⏱️ Приём ответов завершён. Ожидаем вердикт ИИ-судьи Qwen...',
      spectator_judging_msg: '⚖️ ИИ-судья Qwen оценивает ответы всех команд...',
      spectator_team_status_title: 'Статус команд в раунде',
      status_answered: '✅ Ответ отправлен',
      status_thinking: '⏳ Обсуждают...',
      answered_summary: 'Ответили: {submitted} из {total}',

      // Team select screen
      create_team_heading: 'Создать новую команду',
      become_captain_badge: 'Вы станете капитаном 👑',
      team_name_label: 'Название команды',
      team_name_placeholder: 'Введите название команды',
      choose_emblem_label: 'Выберите эмблему команды',
      create_team_btn: 'Создать команду и стать капитаном',
      join_existing_heading: 'Или вступить в существующую команду',
      teams_count: '{n} команд',
      no_teams_yet: 'Команд пока нет. Создайте первую команду!',
      your_team_btn: 'Ваша команда',
      join_btn: 'Вступить',
      members_short: 'уч.',
      offline_tag: '(офлайн)',
      nobody_yet: 'пока никого',

      // Lobby screen
      your_team_title: '{emoji} Ваша команда: {name}',
      role_captain: '👑 Вы капитан команды',
      role_member: 'Участник команды',
      captain_hint: 'Во время раунда вы будете видеть идеи участников и отправлять итоговый ответ команды.',
      member_hint: 'Во время раунда вы сможете предлагать свои варианты ответа капитану команды.',
      leave_team_btn: 'Сменить / покинуть команду',
      all_teams_lobby: 'Все команды в лобби',
      waiting_host_start: 'Ожидаем, пока ведущий запустит первый раунд.',
      pts_short: 'б.',

      // Round screen
      round_heading: 'Раунд {num} из {total}: {title}',
      time_left: 'Осталось времени',
      timer_paused_label: 'Таймер на паузе',
      paused_suffix: '(ПАУЗА)',
      round_locked_msg: '⏱️ Приём ответов завершён.',
      your_team_final_ans: 'Итоговый ответ вашей команды:',
      no_answer_submitted: 'Ваша команда не успела отправить ответ.',
      qwen_judging_msg: 'ИИ-судья Qwen оценивает ответы всех команд...',
      captain_answer_label: '👑 Итоговый ответ команды',
      captain_answer_placeholder: 'Введите итоговый ответ команды или подставьте идею от участника ниже...',
      send_final_btn: 'Отправить итоговый ответ команды',
      update_final_btn: 'Обновить ответ команды',
      captain_submitted_banner: '✅ Ответ команды отправлен:',
      can_update_before_end: '(можно обновить до конца таймера)',
      member_official_waiting: '⏳ Капитан ещё не отправил итоговый ответ команды.',
      member_official_sent: '✅ Капитан отправил ответ команды:',
      suggest_idea_label: '💡 Предложить вариант ответа капитану',
      suggest_idea_placeholder: 'Напишите вашу идею или аргумент для капитана...',
      send_idea_btn: 'Отправить идею в команду',
      ideas_heading: 'Командное обсуждение',
      captain_note_placeholder: 'Написать заметку команде...',
      send_short_btn: 'Отправить',
      no_ideas_yet: 'Пока нет предложений. Обсудите вопрос и предложите варианты!',
      use_idea_btn: 'Подставить',

      // Results & Finished
      results_title: 'Итоги раунда {num}: {title}',
      judge_qwen: '⚖️ Судья: {model}',
      judge_manual: '✍️ Оценка ведущего',
      judge_fallback: '⚙️ Автооценка',
      reference_answer_heading: 'ПРАВИЛЬНЫЙ ОТВЕТ',
      judge_verdict_label: 'Вердикт судьи:',
      team_scores_heading: 'Оценки команд в этом раунде',
      your_team_pill: 'Ваша команда',
      answer_label: 'Ответ:',
      no_answer_label: 'нет ответа',
      leaderboard_heading: '🏆 Общая турнирная таблица',
      leaderboard_empty: 'Рейтинг пока пуст.',
      you_pill: 'Вы',
      quiz_finished_heading: '🎉 Квиз завершён! Итоговый рейтинг',
      round_history_heading: 'История раундов',
      no_finished_rounds: 'Раунды не были завершены.',
      round_prefix: 'Раунд',
      answer_prefix: 'Ответ:',

      // Toasts
      toast_login_err: 'Не удалось войти',
      toast_create_team_err: 'Не удалось создать команду',
      toast_team_created: 'Команда создана! Вы назначены капитаном 👑',
      toast_join_err: 'Не удалось вступить в команду',
      toast_joined: 'Вы присоединились к команде!',
      toast_leave_err: 'Ошибка выхода из команды',
      toast_idea_inserted: 'Идея подставлена в поле ответа. Нажмите «Отправить».',
      toast_enter_answer: 'Введите итоговый ответ команды',
      toast_send_err: 'Не удалось отправить ответ',
      toast_answer_sent: 'Итоговый ответ команды отправлен!',
      toast_idea_err: 'Не удалось отправить идею',
      toast_idea_sent: 'Идея отправлена команде!',
      toast_kicked: 'Ведущий удалил вас из текущей сессии.',

      // Admin UI
      admin_title: 'Панель администратора',
      admin_subtitle: 'Управление квизом и ИИ-судьей Qwen',
      admin_login_label: 'Логин администратора',
      admin_password_label: 'Пароль',
      admin_login_btn: 'Войти в панель управления',
      admin_header_title: 'Панель ведущего квиза',
      copy_student_link: '🔗 Ссылка для студентов',
      logout_btn: 'Выйти',
      tab_control: '🎮 Управление игрой',
      tab_questions: '📝 База вопросов',
      tab_settings: '🤖 Настройки ИИ Qwen',
      round_panel_title: 'Пульт раунда',
      select_question_label: 'Выберите вопрос для раунда',
      start_round_btn: '▶ Запустить раунд',
      ref_answer_admin_label: 'ЭТАЛОННЫЙ ОТВЕТ',
      pause_btn: '⏸ Пауза',
      resume_btn: '▶ Продолжить',
      add_time_btn: '⏱ +30 сек',
      lock_round_btn: '⏹ Завершить приём ответов',
      judge_qwen_btn: '⚖️ Судить раунд с помощью ИИ Qwen',
      manual_judge_btn: '✍️ Оценить вручную',
      reopen_round_btn: '🔓 Открыть ещё на 30 сек',
      publish_results_btn: '📢 Опубликовать результаты студентам',
      finish_quiz_btn: '🏆 Завершить квиз',
      reset_scores_btn: '🔄 Сбросить очки',
      reset_all_btn: '🗑 Полный сброс',
      current_rating_title: '🏆 Текущий рейтинг команд',
      teams_and_answers_title: 'Команды и ответы',
      unassigned_title: 'Участники без команды',
      kick_all_unassigned: '🗑 Удалить всех',
      status_prefix: 'Статус:',
      online_stats: '👥 {online} онлайн, всего {total}',
      answered_stats: '{submitted} / {total} ответили',
      phase_LOBBY: 'Ожидание старта',
      phase_ROUND_ACTIVE: 'Идёт раунд',
      phase_ROUND_LOCKED: 'Приём ответов закрыт',
      phase_JUDGING: 'Судейство ИИ Qwen...',
      phase_ROUND_RESULTS: 'Показаны итоги раунда',
      phase_FINISHED: 'Квиз завершён'
    },
    kk: {
      page_title_student: 'Командалық квиз — Қатысушы',
      page_title_admin: 'Әкімші панелі — Qwen квизі',
      default_quiz_title: 'Философия бойынша интерактивті квиз',
      connecting: 'Серверге қосылу...',
      online: 'Онлайн',
      reconnecting: 'Қайта қосылу...',
      change_name: 'Атын өзгерту',

      // Login screen
      login_welcome: 'Квизге қош келдіңіз!',
      login_subtitle: 'Команда құру немесе бар командаға қосылу үшін атыңызды енгізіңіз.',
      your_name_label: 'Сіздің атыңыз',
      your_name_placeholder: 'Атыңызды енгізіңіз',
      enter_quiz_btn: 'Квизге кіру',
      or_divider: 'немесе',
      enter_spectator_btn: '👀 Бақылаушы ретінде кіру',
      spectator_badge: '👀 Бақылаушы',
      become_player_btn: 'Қатысушы болу',
      spectator_lobby_title: 'Квиздің басталуын күту',
      spectator_lobby_hint: 'Командалар өз құрылғыларында жиналуда. Жүргізуші жақында бірінші раундты бастайды.',
      spectator_round_hidden_msg: '💬 Командалар сұрақты талқылап, жауап дайындауда.',
      spectator_locked_msg: '⏱️ Жауап қабылдау аяқталды. AI-төреші Qwen шешімін күтудеміз...',
      spectator_judging_msg: '⚖️ AI-төреші Qwen барлық командалардың жауаптарын бағалауда...',
      spectator_team_status_title: 'Раундтағы командалар күйі',
      status_answered: '✅ Жауап жіберілді',
      status_thinking: '⏳ Талқылауда...',
      answered_summary: 'Жауап берді: {submitted} / {total}',

      // Team select screen
      create_team_heading: 'Жаңа команда құру',
      become_captain_badge: 'Сіз капитан боласыз 👑',
      team_name_label: 'Команда атауы',
      team_name_placeholder: 'Команда атауын енгізіңіз',
      choose_emblem_label: 'Команда эмблемасын таңдаңыз',
      create_team_btn: 'Команда құрып, капитан болу',
      join_existing_heading: 'Немесе бар командаға қосылу',
      teams_count: '{n} команда',
      no_teams_yet: 'Әзірге командалар жоқ. Алғашқы команданы құрыңыз!',
      your_team_btn: 'Сіздің командаңыз',
      join_btn: 'Қосылу',
      members_short: 'қатыс.',
      offline_tag: '(офлайн)',
      nobody_yet: 'әзірге ешкім жоқ',

      // Lobby screen
      your_team_title: '{emoji} Сіздің командаңыз: {name}',
      role_captain: '👑 Сіз команда капитанысыз',
      role_member: 'Команда мүшесі',
      captain_hint: 'Раунд кезінде сіз қатысушылардың идеяларын көріп, команданың қорытынды жауабын жібересіз.',
      member_hint: 'Раунд кезінде сіз команда капитанына өз жауап нұсқаларыңызды ұсына аласыз.',
      leave_team_btn: 'Команданы ауыстыру / шығу',
      all_teams_lobby: 'Лоббидегі барлық командалар',
      waiting_host_start: 'Жүргізушінің бірінші раундты бастауын күтудеміз.',
      pts_short: 'ұп.',

      // Round screen
      round_heading: '{num}-раунд / {total}: {title}',
      time_left: 'Қалған уақыт',
      timer_paused_label: 'Таймер кідіртілді',
      paused_suffix: '(ҮЗІЛІС)',
      round_locked_msg: '⏱️ Жауап қабылдау аяқталды.',
      your_team_final_ans: 'Командаңыздың қорытынды жауабы:',
      no_answer_submitted: 'Командаңыз жауап жіберіп үлгермеді.',
      qwen_judging_msg: 'AI-төреші Qwen барлық командалардың жауаптарын бағалауда...',
      captain_answer_label: '👑 Команданың қорытынды жауабы',
      captain_answer_placeholder: 'Команданың қорытынды жауабын енгізіңіз немесе төменнен қатысушының идеясын таңдаңыз...',
      send_final_btn: 'Команданың қорытынды жауабын жіберу',
      update_final_btn: 'Команда жауабын жаңарту',
      captain_submitted_banner: '✅ Команда жауабы жіберілді:',
      can_update_before_end: '(таймер біткенше жаңартуға болады)',
      member_official_waiting: '⏳ Капитан команданың қорытынды жауабын әлі жіберген жоқ.',
      member_official_sent: '✅ Капитан команда жауабын жіберді:',
      suggest_idea_label: '💡 Капитанға жауап нұсқасын ұсыну',
      suggest_idea_placeholder: 'Капитанға идеяңызды немесе дәлеліңізді жазыңыз...',
      send_idea_btn: 'Идеяны командаға жіберу',
      ideas_heading: 'Командалық талқылау',
      captain_note_placeholder: 'Командаға ескертпе жазу...',
      send_short_btn: 'Жіберу',
      no_ideas_yet: 'Әзірге ұсыныстар жоқ. Сұрақты талқылап, нұсқалар ұсыныңыз!',
      use_idea_btn: 'Қолдану',

      // Results & Finished
      results_title: '{num}-раунд қорытындысы: {title}',
      judge_qwen: '⚖️ Төреші: {model}',
      judge_manual: '✍️ Жүргізуші бағасы',
      judge_fallback: '⚙️ Автобағалау',
      reference_answer_heading: 'ДҰРЫС ЖАУАП',
      judge_verdict_label: 'Төреші шешімі:',
      team_scores_heading: 'Осы раундтағы команда бағалары',
      your_team_pill: 'Сіздің командаңыз',
      answer_label: 'Жауап:',
      no_answer_label: 'жауап жоқ',
      leaderboard_heading: '🏆 Жалпы турнир кестесі',
      leaderboard_empty: 'Рейтинг әзірге бос.',
      you_pill: 'Сіз',
      quiz_finished_heading: '🎉 Квиз аяқталды! Қорытынды рейтинг',
      round_history_heading: 'Раундтар тарихы',
      no_finished_rounds: 'Раундтар аяқталған жоқ.',
      round_prefix: 'Раунд',
      answer_prefix: 'Жауап:',

      // Toasts
      toast_login_err: 'Кіру мүмкін болмады',
      toast_create_team_err: 'Команда құру мүмкін болмады',
      toast_team_created: 'Команда құрылды! Сіз капитан болып тағайындалдыңыз 👑',
      toast_join_err: 'Командаға қосылу мүмкін болмады',
      toast_joined: 'Сіз командаға қосылдыңыз!',
      toast_leave_err: 'Командадан шығу қатесі',
      toast_idea_inserted: 'Идея жауап өрісіне қойылды. «Жіберу» батырмасын басыңыз.',
      toast_enter_answer: 'Команданың қорытынды жауабын енгізіңіз',
      toast_send_err: 'Жауапты жіберу мүмкін болмады',
      toast_answer_sent: 'Команданың қорытынды жауабы жіберілді!',
      toast_idea_err: 'Идеяны жіберу мүмкін болмады',
      toast_idea_sent: 'Идея командаға жіберілді!',
      toast_kicked: 'Жүргізуші сізді ағымдағы сессиядан шығарды.',

      // Admin UI
      admin_title: 'Әкімші панелі',
      admin_subtitle: 'Квизді және AI-төреші Qwen-ді басқару',
      admin_login_label: 'Әкімші логині',
      admin_password_label: 'Құпиясөз',
      admin_login_btn: 'Басқару панеліне кіру',
      admin_header_title: 'Квиз жүргізушісінің панелі',
      copy_student_link: '🔗 Студенттер сілтемесі',
      logout_btn: 'Шығу',
      tab_control: '🎮 Ойынды басқару',
      tab_questions: '📝 Сұрақтар базасы',
      tab_settings: '🤖 Qwen AI баптаулары',
      round_panel_title: 'Раунд пульті',
      select_question_label: 'Раунд сұрағын таңдаңыз',
      start_round_btn: '▶ Раундты бастау',
      ref_answer_admin_label: 'ЭТАЛОНДЫҚ ЖАУАП',
      pause_btn: '⏸ Үзіліс',
      resume_btn: '▶ Жалғастыру',
      add_time_btn: '⏱ +30 сек',
      lock_round_btn: '⏹ Жауап қабылдауды аяқтау',
      judge_qwen_btn: '⚖️ Qwen AI көмегімен бағалау',
      manual_judge_btn: '✍️ Қолмен бағалау',
      reopen_round_btn: '🔓 Тағы 30 сек ашу',
      publish_results_btn: '📢 Нәтижені студенттерге жариялау',
      finish_quiz_btn: '🏆 Квизді аяқтау',
      reset_scores_btn: '🔄 Ұпайларды нөлдеу',
      reset_all_btn: '🗑 Толық тазарту',
      current_rating_title: '🏆 Командалардың ағымдағы рейтингі',
      teams_and_answers_title: 'Командалар мен жауаптар',
      unassigned_title: 'Командасыз қатысушылар',
      kick_all_unassigned: '🗑 Барлығын өшіру',
      status_prefix: 'Күйі:',
      online_stats: '👥 {online} онлайн, барлығы {total}',
      answered_stats: '{submitted} / {total} жауап берді',
      phase_LOBBY: 'Басталуын күту',
      phase_ROUND_ACTIVE: 'Раунд жүріп жатыр',
      phase_ROUND_LOCKED: 'Жауап қабылдау жабылды',
      phase_JUDGING: 'Qwen AI бағалауда...',
      phase_ROUND_RESULTS: 'Раунд қорытындысы көрсетілді',
      phase_FINISHED: 'Квиз аяқталды'
    }
  };

  function getLang() {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    return saved === 'kk' ? 'kk' : 'ru';
  }

  function setLang(lang) {
    const next = lang === 'kk' ? 'kk' : 'ru';
    localStorage.setItem(LANG_STORAGE_KEY, next);
    document.documentElement.lang = next;
    return next;
  }

  function t(key, vars = {}) {
    const lang = getLang();
    const dict = TRANSLATIONS[lang] || TRANSLATIONS.ru;
    let str = dict[key] ?? TRANSLATIONS.ru[key] ?? key;
    for (const [k, v] of Object.entries(vars)) {
      str = str.replaceAll(`{${k}}`, String(v ?? ''));
    }
    return str;
  }

  function pickLocalized(ruValue, kkValue) {
    if (getLang() === 'kk' && kkValue && String(kkValue).trim()) {
      return kkValue;
    }
    return ruValue || '';
  }

  function applyStaticTranslations() {
    const lang = getLang();
    document.documentElement.lang = lang;

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (key) el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) el.setAttribute('placeholder', t(key));
    });
    document.querySelectorAll('[data-set-lang]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-set-lang') === lang);
    });
  }

  function initLangSwitcher(onChange) {
    applyStaticTranslations();
    document.querySelectorAll('[data-set-lang]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextLang = btn.getAttribute('data-set-lang');
        if (nextLang === getLang()) return;
        setLang(nextLang);
        applyStaticTranslations();
        if (typeof onChange === 'function') {
          onChange(nextLang);
        }
      });
    });
  }

  window.QuizI18n = {
    getLang,
    setLang,
    t,
    pickLocalized,
    applyStaticTranslations,
    initLangSwitcher
  };
})();
