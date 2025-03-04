import { default as discourseComputed, on, observes } from 'discourse-common/utils/decorators';
import { eventsForDay, calendarDays, calendarRange } from '../lib/date-utilities';
import { or, not, alias } from "@ember/object/computed";
import Category from 'discourse/models/category';
import { ajax } from 'discourse/lib/ajax';
import Component from "@ember/component";
import { scheduleOnce, bind } from "@ember/runloop";
import { inject as service } from "@ember/service";
import I18n from "I18n";

const RESPONSIVE_BREAKPOINT = 800;
const YEARS = [
  moment().subtract(1, 'year').year(),
  moment().year(),
  moment().add(1, 'year').year()
];
const KEY_ENDPOINT = "/calendar-events/api_keys.json";

export default Component.extend({
  classNameBindings: [':events-calendar', 'responsive'],
  showEvents: not('eventsBelow'),
  canSelectDate: alias('eventsBelow'),
  routing: service('-routing'),
  queryParams: alias('routing.router.currentState.routerJsState.fullQueryParams'),
  years: YEARS.map(y => ({id: y, name: y})),
  layoutName: 'components/events-calendar',

  @on('init')
  setup() {
    this._super();
    moment.locale(I18n.locale);

    scheduleOnce('afterRender', () => {
      this.handleResize();
      $(window).on('resize', bind(this, this.handleResize));
      $('body').addClass('calendar');
    });

    let currentDate = moment().date();
    let currentMonth = moment().month();
    let currentYear = moment().year();

    // get month and year from the date in middle of the event range
    const initialDateRange = this.get('initialDateRange');
    const queryParams = this.get('queryParams');
    let dateRange = {};
    if (initialDateRange) dateRange = initialDateRange;
    if (queryParams.start) dateRange.start = queryParams.start;
    if (queryParams.end) dateRange.end = queryParams.end;

    if (dateRange.start && dateRange.end) {
      const start = moment(dateRange.start);
      const end = moment(dateRange.end);
      const diff = Math.abs(start.diff(end, "days"));
      const middleDay = start.add(diff/2, 'days');
      currentMonth = middleDay.month();
      currentYear = middleDay.year();
    }

    let month = currentMonth;
    let year = currentYear;

    this.setProperties({ currentDate, currentMonth, currentYear, month, year });
  },

  @discourseComputed('siteSettings.login_required', 'category.read_restricted')
  showNotice(loginRequired, categoryRestricted) {
    return loginRequired || categoryRestricted;
  },
  @on('willDestroy')
  teardown() {
    $(window).off('resize', bind(this, this.handleResize));
    $('body').removeClass('calendar');
  },

  handleResize() {
    if (this._state === 'destroying') return;
    this.set("responsiveBreak", $(window).width() < RESPONSIVE_BREAKPOINT);
  },
  
  forceResponsive: false,
  responsive: or('forceResponsive', 'responsiveBreak', 'site.mobileView'),
  showFullTitle: not('responsive'),
  eventsBelow: alias('responsive'),
  
  @discourseComputed('responsive')
  todayLabel(responsive) {
    return responsive ? null : 'events_calendar.today';
  },

  @discourseComputed
  months() {
    return moment.localeData().months().map((m, i) => {
      return { id: i, name: m };
    });
  },

  @discourseComputed('currentDate', 'currentMonth', 'currentYear', 'topics.[]')
  dateEvents(currentDate, currentMonth, currentYear, topics) {
    const day = moment().year(currentYear).month(currentMonth);
    return eventsForDay(day.date(currentDate), topics, { dateEvents: true, siteSettings: this.siteSettings });
  },

  @discourseComputed('currentMonth', 'currentYear')
  days(currentMonth, currentYear) {
    const { start, end } = calendarDays(currentMonth, currentYear);
    let days = [];
    for (var day = moment(start); day.isBefore(end); day.add(1, 'days')) {
      days.push(moment().year(day.year()).month(day.month()).date(day.date()));
    }
    return days;
  },

  @discourseComputed('category')
  showSubscription(category) {
    return true // !category || !category.read_restricted;
  },

  transitionToMonth(month, year) {
    const { start, end } = calendarRange(month, year);
    const router = this.get('routing.router');

    if (this.get('loading')) return;
    this.set('loading', true);

    return router.transitionTo({
      queryParams: { start, end }
    }).then(() => {
      const category = this.get('category');
      let filter = '';

      if (category) {
        filter += `c/${Category.slugFor(category)}/l/`;
      }
      filter += 'calendar';

      this.store.findFiltered('topicList', {
        filter,
        params: { start, end }
      }).then(list => {
        this.setProperties({
          topics: list.topics,
          currentMonth: month,
          currentYear: year,
          loading: false
        });
      });
    });
  },

  @observes('month', 'year')
  getNewTopics() {
    const currentMonth = this.get('currentMonth');
    const currentYear = this.get('currentYear');
    const month = this.get('month');
    const year = this.get('year');
    if (currentMonth !== month || currentYear !== year) {
      this.transitionToMonth(month, year);
    }
  },

  actions: {
    selectDate(selectedDate, selectedMonth) {
      const month = this.get('month');
      if (month !== selectedMonth) {
        this.set('month', selectedMonth);
      }
      this.set('currentDate', selectedDate);
    },

    today() {
      this.setProperties({
        month: moment().month(),
        year: moment().year(),
        currentDate: moment().date()
      });
    },

    monthPrevious() {
      let currentMonth = this.get('currentMonth');
      let year = this.get('currentYear');
      let month;

      if (currentMonth === 0) {
        month = 11;
        year = year - 1;
      } else {
        month = currentMonth - 1;
      }

      this.setProperties({ month, year });
    },

    monthNext() {
      let currentMonth = this.get('currentMonth');
      let year = this.get('currentYear');
      let month;

      if (currentMonth === 11) {
        month = 0;
        year = year + 1;
      } else {
        month = currentMonth + 1;
      }

      this.setProperties({ month, year });
    }
  }
});
