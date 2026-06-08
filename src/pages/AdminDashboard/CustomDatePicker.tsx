"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import styles from './CustomDatePicker.module.css';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

interface DatePickerProps {
  onRangeChange: (start: Date, end: Date) => void;
}

export default function CustomDatePicker({ onRangeChange }: DatePickerProps) {
  const today = new Date();

  // Data base para o filtro "Tudo" (período completo)
  const ALL_TIME_START = new Date(2020, 0, 1);

  // Estado inicial: Tudo (mostra todo o histórico ao abrir)
  const initialStart = ALL_TIME_START;
  const initialEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

  const [isOpen, setIsOpen] = useState(false);
  const [activeQuick, setActiveQuick] = useState<string>('tudo');

  // Datas confirmadas (exibidas no botão e no calendário)
  const [startDate, setStartDate] = useState<Date>(initialStart);
  const [endDate, setEndDate] = useState<Date>(initialEnd);

  // Seleção temporária enquanto o usuário está clicando (só 1 clique feito)
  const [pendingStart, setPendingStart] = useState<Date | null>(null);

  // O calendário sempre abre no mês da data inicial confirmada
  const [currentDate, setCurrentDate] = useState(new Date(initialStart));

  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setPendingStart(null); // Cancela seleção incompleta ao fechar
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const applyQuickFilter = (filter: string) => {
    setActiveQuick(filter);
    setPendingStart(null);
    const now = new Date();
    let start: Date;
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    if (filter === 'tudo') {
      start = ALL_TIME_START;
    } else if (filter === 'hoje') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (filter === 'mes') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (filter === '7d') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    } else {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
    }

    setStartDate(start);
    setEndDate(end);
    setCurrentDate(new Date(start));
    setIsOpen(false);
    onRangeChange(start, end);
  };

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const handleDayClick = (day: number) => {
    const clickedDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);

    if (!pendingStart) {
      // Primeiro clique: guarda como pendente, não confirma ainda
      setPendingStart(clickedDate);
      setActiveQuick('custom');
    } else {
      // Segundo clique: confirma o range
      let finalStart = pendingStart;
      let finalEnd = clickedDate;

      if (clickedDate < pendingStart) {
        finalStart = clickedDate;
        finalEnd = pendingStart;
      }

      const endOfDay = new Date(finalEnd.getFullYear(), finalEnd.getMonth(), finalEnd.getDate(), 23, 59, 59);

      // Atualiza estado confirmado
      setStartDate(finalStart);
      setEndDate(endOfDay);
      setPendingStart(null);
      setIsOpen(false);
      onRangeChange(finalStart, endOfDay);
    }
  };

  const toMidnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

  // Usa pendingStart pra preview visual enquanto seleciona
  const effectiveStart = pendingStart ?? startDate;
  const effectiveEnd = pendingStart ? null : endDate;

  const isSelected = (day: number) => {
    const t = toMidnight(new Date(currentDate.getFullYear(), currentDate.getMonth(), day));
    const matchStart = toMidnight(effectiveStart) === t;
    const matchEnd = effectiveEnd && toMidnight(effectiveEnd) === t;
    return matchStart || !!matchEnd;
  };

  const isInRange = (day: number) => {
    if (!effectiveEnd) return false;
    const t = toMidnight(new Date(currentDate.getFullYear(), currentDate.getMonth(), day));
    return t > toMidnight(effectiveStart) && t < toMidnight(effectiveEnd);
  };

  const isRangeStart = (day: number) => {
    if (!effectiveEnd) return false;
    return toMidnight(new Date(currentDate.getFullYear(), currentDate.getMonth(), day)) === toMidnight(effectiveStart);
  };

  const isRangeEnd = (day: number) => {
    if (!effectiveEnd) return false;
    return toMidnight(new Date(currentDate.getFullYear(), currentDate.getMonth(), day)) === toMidnight(effectiveEnd);
  };

  const renderCalendarDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const days = [];

    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className={styles.dayCell} />);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      days.push(
        <div key={day} className={styles.dayCell}>
          {(isInRange(day) || isRangeStart(day) || isRangeEnd(day)) && (
            <div className={`${styles.inRangeBg} ${isRangeStart(day) ? styles.start : ''} ${isRangeEnd(day) ? styles.end : ''}`} />
          )}
          <button
            className={`${styles.dayBtn} ${isSelected(day) ? styles.selected : ''}`}
            onClick={() => handleDayClick(day)}
          >
            {day}
          </button>
        </div>
      );
    }
    return days;
  };

  const formatDateRange = () => {
    const fmt = (d: Date) => d.toLocaleDateString('pt-BR');
    if (pendingStart) return `${fmt(pendingStart)} - selecione o fim`;
    if (activeQuick === 'tudo') return 'Todo o período';
    return `${fmt(startDate)} - ${fmt(endDate)}`;
  };

  return (
    <div className={styles.container} ref={popoverRef}>
      <button className={styles.triggerBtn} onClick={() => setIsOpen(!isOpen)}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CalendarIcon size={16} color="#a855f7" />
          {formatDateRange()}
        </span>
        <ChevronDown size={16} color="#8b8b93" />
      </button>

      {isOpen && (
        <div className={styles.popover}>
          <div className={styles.quickFilters}>
            <button className={`${styles.quickBtn} ${activeQuick === 'tudo' ? styles.active : ''}`} onClick={() => applyQuickFilter('tudo')}>Tudo</button>
            <button className={`${styles.quickBtn} ${activeQuick === 'hoje' ? styles.active : ''}`} onClick={() => applyQuickFilter('hoje')}>Hoje</button>
            <button className={`${styles.quickBtn} ${activeQuick === 'mes' ? styles.active : ''}`} onClick={() => applyQuickFilter('mes')}>Este Mês</button>
            <button className={`${styles.quickBtn} ${activeQuick === '7d' ? styles.active : ''}`} onClick={() => applyQuickFilter('7d')}>Últ. 7 dias</button>
            <button className={`${styles.quickBtn} ${activeQuick === '30d' ? styles.active : ''}`} onClick={() => applyQuickFilter('30d')}>Últ. 30 dias</button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', fontSize: '12px' }}>
            <span style={{ color: '#8b8b93' }}>PERÍODO PERSONALIZADO</span>
            <span style={{ color: '#a855f7', fontWeight: 500 }}>
              {pendingStart ? "2. Clique na data final" : "1. Clique na data inicial"}
            </span>
          </div>

          <div className={styles.calendarHeader}>
            <button className={styles.navBtn} onClick={handlePrevMonth}><ChevronLeft size={18} /></button>
            <div className={styles.monthTitle}>{MESES[currentDate.getMonth()]} {currentDate.getFullYear()}</div>
            <button className={styles.navBtn} onClick={handleNextMonth}><ChevronRight size={18} /></button>
          </div>

          <div className={styles.weekDays}>
            {DIAS_SEMANA.map(day => <div key={day}>{day}</div>)}
          </div>

          <div className={styles.daysGrid}>
            {renderCalendarDays()}
          </div>
        </div>
      )}
    </div>
  );
}