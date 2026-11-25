(() => {
  const LANG_STORAGE_KEY = 'qwen_quiz_lang';

  const TRANSLATIONS = {
    ru: {
      page_title_student: 'Интерактивный квиз — Участник',
      page_title_admin: 'Админ-панель — Квиз Qwen',
      default_quiz_title: 'Интерактивный квиз по философии',
      connecting: 'Подключение к серверу...',
      online: 'Онлайн',
      reconnecting: 'Переподключение...',
      change_name: 'Сменить имя',
      back_btn: '← Назад',

      // Role select screen
      choose_role_title: 'Выберите режим входа',
      choose_role_subtitle: 'Участвуйте в квизе лично или откройте экран наблюдателя для трансляции результатов.',
      role_play_title: 'Играть',
      role_play_desc: 'Укажите имя, выберите аватар и отвечайте на вопросы самостоятельно.',
      role_spectator_title: 'Наблюдатель',
      role_spectator_desc: 'Просмотр вопроса, таймера, статусов участников и турнирной таблицы без участия.',

      // Login screen
      login_welcome: 'Вход в игру',
      login_subtitle: 'Введите ваше имя и выберите аватар.',
      your_name_label: 'Ваше имя',
      your_name_placeholder: 'Введите ваше имя',
      choose_avatar_label: 'Выберите аватар',
      enter_quiz_btn: 'Войти в игру',

      // Spectator
      spectator_badge: '👀 Наблюдатель',
      become_player_btn: 'Играть',
      spectator_lobby_title: 'Ожидание начала квиза',
      spectator_lobby_hint: 'Участники подключаются. Ведущий скоро запустит первый раунд.',
      spectator_round_active_msg: '💬 Участники отвечают на вопрос.',
      spectator_locked_msg: '⏱️ Приём ответов завершён. Ожидаем вердикт ИИ-судьи Qwen...',
      spectator_judging_msg: '⚖️ ИИ-судья Qwen оценивает ответы участников...',
      spectator_players_status_title: 'Участники в раунде',
      status_answered: '✅',
      status_thinking: '⏳',
      answered_summary: 'Ответили: {submitted} из {total}',

      // Lobby screen
      my_profile_title: '{emoji} {name}',
      individual_mode_badge: 'Личный зачёт',
      lobby_ready_hint: 'Вы в игре! Ожидайте запуска раунда от ведущего.',
      leave_to_roles_btn: 'Сменить режим',
      all_players_lobby: 'Участники в лобби',
      players_count: '{n} участников',
      no_players_yet: 'Пока нет подключённых участников.',
      waiting_host_start: 'Ожидаем, пока ведущий запустит первый раунд.',
      pts_short: 'б.',
      offline_tag: '(офлайн)',

      // Round screen
      round_heading: 'Раунд {num} из {total}: {title}',
      time_left: 'Осталось времени',
      timer_paused_label: 'Таймер на паузе',
      paused_suffix: '(ПАУЗА)',
      round_locked_msg: '⏱️ Приём ответов завершён.',
      your_final_ans: 'Ваш ответ:',
      no_answer_submitted: 'Вы не успели отправить ответ.',
      qwen_judging_msg: 'ИИ-судья Qwen оценивает ответы участников...',
      player_answer_label: '✍️ Ваш ответ',
      player_answer_placeholder: 'Напишите ваш ответ здесь...',
      send_final_btn: 'Отправить ответ',
      update_final_btn: 'Обновить ответ',
      player_submitted_banner: '✅ Ответ отправлен:',
      can_update_before_end: '(можно обновить до конца таймера)',

      // Results & Finished
      results_title: 'Итоги раунда {num}: {title}',
      judge_qwen: '⚖️ Судья: {model}',
      judge_manual: '✍️ Оценка ведущего',
      judge_fallback: '⚙️ Автооценка',
      judge_system: '⚖️ Автопроверка системы',
      auto_loss_badge: 'Автопроигрыш',
      my_result_heading: 'Ваш результат в раунде',
      reference_answer_heading: 'ПРАВИЛЬНЫЙ ОТВЕТ',
      judge_verdict_label: 'Вердикт судьи:',
      player_scores_heading: 'Оценки участников в раунде',
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
      toast_enter_answer: 'Введите ваш ответ',
      toast_send_err: 'Не удалось отправить ответ',
      toast_answer_sent: 'Ваш ответ отправлен!',
      toast_kicked: 'Ведущий удалил вас из текущей сессии.',
      toast_copy_blocked: 'Копирование вопроса запрещено',
      toast_paste_blocked: 'Вставка текста в ответ запрещена',

      // Admin UI
      admin_title: 'Панель администратора',
      admin_subtitle: 'Управление квизом и ИИ-судьей Qwen',
      admin_login_label: 'Логин администратора',
      admin_password_label: 'Пароль',
      admin_login_btn: 'Войти в панель управления',
      admin_header_title: 'Панель ведущего квиза',
      copy_student_link: '🔗 Ссылка для участников',
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
      publish_results_btn: '📢 Опубликовать результаты',
      finish_quiz_btn: '🏆 Завершить квиз',
      reset_scores_btn: '🔄 Сбросить очки',
      reset_all_btn: '🗑 Полный сброс',
      current_rating_title: '🏆 Текущий рейтинг участников',
      players_and_answers_title: 'Участники и ответы',
      kick_offline_btn: '🗑 Удалить офлайн',
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
      page_title_student: 'Интерактивті квиз — Қатысушы',
      page_title_admin: 'Әкімші панелі — Qwen квизі',
      default_quiz_title: 'Философия бойынша интерактивті квиз',
      connecting: 'Серверге қосылу...',
      online: 'Онлайн',
      reconnecting: 'Қайта қосылу...',
      change_name: 'Атын өзгерту',
      back_btn: '← Артқа',

      // Role select screen
      choose_role_title: 'Кіру режимін таңдаңыз',
      choose_role_subtitle: 'Квизге жеке қатысыңыз немесе нәтижелерді көрсету үшін бақылаушы экранын ашыңыз.',
      role_play_title: 'Ойнау',
      role_play_desc: 'Атыңызды енгізіп, аватар таңдаңыз және сұрақтарға өзіңіз жауап беріңіз.',
      role_spectator_title: 'Бақылаушы',
      role_spectator_desc: 'Ойынға қатыспай сұрақты, таймерді, қатысушылар күйін және турнир кестесін көру.',

      // Login screen
      login_welcome: 'Ойынға кіру',
      login_subtitle: 'Атыңызды енгізіп, аватар таңдаңыз.',
      your_name_label: 'Сіздің атыңыз',
      your_name_placeholder: 'Атыңызды енгізіңіз',
      choose_avatar_label: 'Аватар таңдаңыз',
      enter_quiz_btn: 'Ойынға кіру',

      // Spectator
      spectator_badge: '👀 Бақылаушы',
      become_player_btn: 'Ойнау',
      spectator_lobby_title: 'Квиздің басталуын күту',
      spectator_lobby_hint: 'Қатысушылар қосылуда. Жүргізуші жақында бірінші раундты бастайды.',
      spectator_round_active_msg: '💬 Қатысушылар сұраққа жауап беруде.',
      spectator_locked_msg: '⏱️ Жауап қабылдау аяқталды. AI-төреші Qwen шешімін күтудеміз...',
      spectator_judging_msg: '⚖️ AI-төреші Qwen қатысушылардың жауаптарын бағалауда...',
      spectator_players_status_title: 'Раундтағы қатысушылар',
      status_answered: '✅',
      status_thinking: '⏳',
      answered_summary: 'Жауап берді: {submitted} / {total}',

      // Lobby screen
      my_profile_title: '{emoji} {name}',
      individual_mode_badge: 'Жеке сынақ',
      lobby_ready_hint: 'Сіз ойындасыз! Жүргізушінің раундты бастауын күтіңіз.',
      leave_to_roles_btn: 'Режимді ауыстыру',
      all_players_lobby: 'Лоббидегі қатысушылар',
      players_count: '{n} қатысушы',
      no_players_yet: 'Әзірге қосылған қатысушылар жоқ.',
      waiting_host_start: 'Жүргізушінің бірінші раундты бастауын күтудеміз.',
      pts_short: 'ұп.',
      offline_tag: '(офлайн)',

      // Round screen
      round_heading: '{num}-раунд / {total}: {title}',
      time_left: 'Қалған уақыт',
      timer_paused_label: 'Таймер кідіртілді',
      paused_suffix: '(ҮЗІЛІС)',
      round_locked_msg: '⏱️ Жауап қабылдау аяқталды.',
      your_final_ans: 'Сіздің жауабыңыз:',
      no_answer_submitted: 'Сіз жауап жіберіп үлгермедіңіз.',
      qwen_judging_msg: 'AI-төреші Qwen қатысушылардың жауаптарын бағалауда...',
      player_answer_label: '✍️ Сіздің жауабыңыз',
      player_answer_placeholder: 'Жауабыңызды осында жазыңыз...',
      send_final_btn: 'Жауапты жіберу',
      update_final_btn: 'Жауапты жаңарту',
      player_submitted_banner: '✅ Жауап жіберілді:',
      can_update_before_end: '(таймер біткенше жаңартуға болады)',

      // Results & Finished
      results_title: '{num}-раунд қорытындысы: {title}',
      judge_qwen: '⚖️ Төреші: {model}',
      judge_manual: '✍️ Жүргізуші бағасы',
      judge_fallback: '⚙️ Автобағалау',
      judge_system: '⚖️ Жүйенің автотексеруі',
      auto_loss_badge: 'Автожеңіліс',
      my_result_heading: 'Раундтағы сіздің нәтижеңіз',
      reference_answer_heading: 'ДҰРЫС ЖАУАП',
      judge_verdict_label: 'Төреші шешімі:',
      player_scores_heading: 'Осы раундтағы қатысушылар бағасы',
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
      toast_enter_answer: 'Жауабыңызды енгізіңіз',
      toast_send_err: 'Жауапты жіберу мүмкін болмады',
      toast_answer_sent: 'Жауабыңыз жіберілді!',
      toast_kicked: 'Жүргізуші сізді ағымдағы сессиядан шығарды.',
      toast_copy_blocked: 'Сұрақты көшіруге тыйым салынған',
      toast_paste_blocked: 'Жауапқа мәтін қоюға тыйым салынған',

      // Admin UI
      admin_title: 'Әкімші панелі',
      admin_subtitle: 'Квизді және AI-төреші Qwen-ді басқару',
      admin_login_label: 'Әкімші логині',
      admin_password_label: 'Құпиясөз',
      admin_login_btn: 'Басқару панеліне кіру',
      admin_header_title: 'Квиз жүргізушісінің панелі',
      copy_student_link: '🔗 Қатысушылар сілтемесі',
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
      publish_results_btn: '📢 Нәтижені жариялау',
      finish_quiz_btn: '🏆 Квизді аяқтау',
      reset_scores_btn: '🔄 Ұпайларды нөлдеу',
      reset_all_btn: '🗑 Толық тазарту',
      current_rating_title: '🏆 Қатысушылардың ағымдағы рейтингі',
      players_and_answers_title: 'Қатысушылар мен жауаптар',
      kick_offline_btn: '🗑 Офлайндарды өшіру',
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
